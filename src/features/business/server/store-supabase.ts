import 'server-only';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { ApiError, type ErrorCode } from '@/lib/api/errors';
import { ERROR_CODES } from '@/lib/api/errors';
import type { EventStatus, ProposalStatus } from '@/shared/enums';
import type { CandidateRow } from './candidates';
import type { EventRow, RsvpRow } from './dto';
import type {
  BusinessRow,
  BusinessStore,
  CapabilitiesRow,
  DecideProposalArgs,
  DecideProposalResult,
  EventDetailsPatch,
  InsightCluster,
  NewBusiness,
  NewCapabilities,
  NewEvent,
  ProposalRow,
} from './store';

/**
 * The Supabase-backed `BusinessStore`.
 *
 * Reads and ordinary writes go through `db`, the request-scoped client, so RLS decides what
 * the caller may see. Status changes and proposal decisions go through the RPCs in
 * migration 0501.
 *
 * `admin` is used for exactly the reads a business is not allowed to make itself, and in
 * every one of them the ids are consumed server-side and never returned:
 *   - `demand_cluster_members` and `demand_clusters` (privacy invariant 1, service-role only)
 *   - `rsvps` and the `profiles` join behind the attendee list. A business must never read
 *     `profiles` (invariant 1), and 06's RLS scopes `rsvps` to each attendee, so an owner
 *     session would read zero rows and the counts the spec promises would always be 0.
 *     `buildAttendeeList()` is what makes the result safe to hand back: counts always, a
 *     name only where `share_with_business` is true.
 */

const BUSINESS_COLUMNS =
  'id, owner_id, name, slug, description, category, address, neighborhood, lat, lng, image_url, hours, is_active';
const CAPABILITY_COLUMNS =
  'business_id, event_categories, capacity, min_price_cents, max_price_cents, hosting_slots, equipment_tags, formats, notes, accepts_ai_proposals';
const EVENT_COLUMNS =
  'id, business_id, proposal_id, source, title, description, category, format, starts_at, ends_at, capacity, price_cents, status, published_at, cancelled_at, cancel_reason';
const PROPOSAL_COLUMNS =
  'id, business_id, cluster_id, status, proposal, business_edits, decision_note, decided_at, resulting_event_id, expires_at, created_at';

/**
 * A table another workstream has not merged yet. Postgres raises `42P01`, but PostgREST
 * answers from its own schema cache and reports `PGRST205` instead, so both are needed —
 * only the live stack showed that the `42P01` check alone never fired.
 */
const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205']);
const isMissingTable = (error: { code?: string } | null): boolean =>
  error?.code !== undefined && MISSING_TABLE_CODES.has(error.code);

const isErrorCode = (value: string): value is ErrorCode =>
  (ERROR_CODES as readonly string[]).includes(value);

/**
 * The RPCs raise `'<ERROR_CODE>: message'` (migration 0501). Anything else is an internal
 * failure and its Postgres text never reaches the client.
 */
export function toApiError(error: PostgrestError, fallback: string): ApiError {
  const [prefix, ...rest] = error.message.split(': ');
  if (prefix && isErrorCode(prefix) && rest.length > 0) {
    return new ApiError(prefix, rest.join(': '));
  }
  console.error('[ws05] unexpected database error', { code: error.code, message: error.message });
  return new ApiError('INTERNAL', fallback);
}

function unwrap<T>(result: { data: T | null; error: PostgrestError | null }, fallback: string): T {
  if (result.error) throw toApiError(result.error, fallback);
  if (result.data === null) throw new ApiError('INTERNAL', fallback);
  return result.data;
}

export function createSupabaseStore(db: SupabaseClient, admin: () => SupabaseClient): BusinessStore {
  /**
   * `admin()` throws when SUPABASE_SERVICE_ROLE_KEY is unset. An attendee count is not
   * worth a 500 on the dashboard, so a service-role read that cannot be made falls back to
   * its empty value, exactly like a table a workstream has not merged yet.
   */
  function serviceRole(purpose: string): SupabaseClient | null {
    try {
      return admin();
    } catch (err) {
      console.warn(`[ws05] no service-role client, skipping ${purpose}`, err);
      return null;
    }
  }

  /** `rsvps` belongs to workstream 06; until it merges every read returns empty. */
  async function rsvpRows(eventId: string): Promise<(RsvpRow & { user_id: string })[]> {
    const service = serviceRole('the attendee list');
    if (!service) return [];

    const { data, error } = await service
      .from('rsvps')
      .select('user_id, status, share_with_business, profiles(display_name)')
      .eq('event_id', eventId);

    if (error) {
      if (isMissingTable(error)) return [];
      throw toApiError(error, 'could not read the attendee list');
    }

    type Raw = {
      user_id: string;
      status: string;
      share_with_business: boolean | null;
      profiles: { display_name: string | null } | { display_name: string | null }[] | null;
    };

    return (data as Raw[]).map((row) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return {
        user_id: row.user_id,
        status: row.status,
        share_with_business: row.share_with_business ?? false,
        display_name: profile?.display_name ?? null,
      };
    });
  }

  return {
    async findBusinessByOwner(ownerId) {
      const { data, error } = await db
        .from('businesses')
        .select(BUSINESS_COLUMNS)
        .eq('owner_id', ownerId)
        .maybeSingle();
      if (error) throw toApiError(error, 'could not read the business');
      return (data as BusinessRow | null) ?? null;
    },

    async findBusinessById(businessId) {
      const { data, error } = await db
        .from('businesses')
        .select(BUSINESS_COLUMNS)
        .eq('id', businessId)
        .maybeSingle();
      if (error) throw toApiError(error, 'could not read the business');
      return (data as BusinessRow | null) ?? null;
    },

    async findCapabilities(businessId) {
      const { data, error } = await db
        .from('business_capabilities')
        .select(CAPABILITY_COLUMNS)
        .eq('business_id', businessId)
        .maybeSingle();
      if (error) throw toApiError(error, 'could not read the venue capabilities');
      return (data as CapabilitiesRow | null) ?? null;
    },

    async createBusiness(business: NewBusiness, capabilities: Omit<NewCapabilities, 'business_id'>) {
      const row = unwrap(
        await db.from('businesses').insert(business).select(BUSINESS_COLUMNS).single(),
        'could not create the business',
      ) as BusinessRow;

      const { error } = await db
        .from('business_capabilities')
        .insert({ ...capabilities, business_id: row.id });

      if (error) {
        // Keep the two rows consistent: an owner with no capabilities cannot be onboarded.
        await db.from('businesses').delete().eq('id', row.id);
        throw toApiError(error, 'could not save what the venue can host');
      }
      return row;
    },

    async updateBusiness(businessId, patch: Partial<NewBusiness>) {
      return unwrap(
        await db.from('businesses').update(patch).eq('id', businessId).select(BUSINESS_COLUMNS).single(),
        'could not update the business',
      ) as BusinessRow;
    },

    async updateCapabilities(businessId, patch) {
      return unwrap(
        await db
          .from('business_capabilities')
          .update(patch)
          .eq('business_id', businessId)
          .select(CAPABILITY_COLUMNS)
          .single(),
        'could not update what the venue can host',
      ) as CapabilitiesRow;
    },

    async slugExists(slug) {
      const { data, error } = await db.from('businesses').select('id').eq('slug', slug).maybeSingle();
      if (error) throw toApiError(error, 'could not check the venue slug');
      return data !== null;
    },

    async listEventsForBusiness(businessId) {
      const { data, error } = await db
        .from('events')
        .select(EVENT_COLUMNS)
        .eq('business_id', businessId)
        .order('starts_at', { ascending: false });
      if (error) throw toApiError(error, 'could not list the events');
      return (data ?? []) as EventRow[];
    },

    async findEvent(eventId) {
      const { data, error } = await db.from('events').select(EVENT_COLUMNS).eq('id', eventId).maybeSingle();
      if (error) throw toApiError(error, 'could not read the event');
      return (data as EventRow | null) ?? null;
    },

    async createEvent(event: NewEvent, status: EventStatus) {
      return unwrap(
        await db.from('events').insert({ ...event, status }).select(EVENT_COLUMNS).single(),
        'could not create the event',
      ) as EventRow;
    },

    async updateEventDetails(eventId, patch: EventDetailsPatch) {
      return unwrap(
        await db.from('events').update(patch).eq('id', eventId).select(EVENT_COLUMNS).single(),
        'could not update the event',
      ) as EventRow;
    },

    async publishEvent(eventId) {
      const { error } = await db.rpc('publish_event', { p_event_id: eventId });
      if (error) throw toApiError(error, 'could not publish the event');
    },

    async cancelEvent(eventId, reason) {
      const { error } = await db.rpc('cancel_event', { p_event_id: eventId, p_reason: reason });
      if (error) throw toApiError(error, 'could not cancel the event');
    },

    async listProposals(businessId, status?: ProposalStatus) {
      const base = db
        .from('event_proposals')
        .select(PROPOSAL_COLUMNS)
        .eq('business_id', businessId)
        .order('created_at', { ascending: false });

      const { data, error } = await (status ? base.eq('status', status) : base);
      if (error) {
        if (isMissingTable(error)) return []; // workstream 04 has not merged yet
        throw toApiError(error, 'could not list the proposals');
      }
      return (data ?? []) as ProposalRow[];
    },

    async findProposal(proposalId) {
      const { data, error } = await db
        .from('event_proposals')
        .select(PROPOSAL_COLUMNS)
        .eq('id', proposalId)
        .maybeSingle();
      if (error) {
        if (isMissingTable(error)) return null;
        throw toApiError(error, 'could not read the proposal');
      }
      return (data as ProposalRow | null) ?? null;
    },

    async decideProposal(args: DecideProposalArgs): Promise<DecideProposalResult> {
      const { data, error } = await db.rpc('decide_proposal', {
        p_proposal_id: args.proposalId,
        p_decision: args.decision,
        p_edits: args.edits,
        p_note: args.note,
        p_event: args.event,
      });
      if (error) throw toApiError(error, 'could not record the decision');
      return data as DecideProposalResult;
    },

    async listRsvps(eventId) {
      return (await rsvpRows(eventId)).map(({ status, share_with_business, display_name }) => ({
        status,
        share_with_business,
        display_name,
      }));
    },

    async countConfirmed(eventId) {
      const service = serviceRole('the confirmed count');
      if (!service) return 0;

      const { count, error } = await service
        .from('rsvps')
        .select('user_id', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .eq('status', 'confirmed');
      if (error) {
        if (isMissingTable(error)) return 0;
        throw toApiError(error, 'could not count the confirmed attendees');
      }
      return count ?? 0;
    },

    async confirmedRsvpUserIds(eventId) {
      return (await rsvpRows(eventId)).filter((r) => r.status === 'confirmed').map((r) => r.user_id);
    },

    async countRepeatAttendees(eventIds) {
      // Service role: the ids are counted here and discarded. `rsvps` belongs to 06.
      if (eventIds.length === 0) return 0;

      const service = serviceRole('the repeat attendee count');
      if (!service) return 0;

      const { data, error } = await service
        .from('rsvps')
        .select('user_id')
        .in('event_id', [...eventIds])
        .eq('status', 'confirmed');

      if (error) {
        if (isMissingTable(error)) return 0;
        throw toApiError(error, 'could not count the repeat attendees');
      }

      const perUser = (data ?? []).reduce<Map<string, number>>((acc, row) => {
        const userId = (row as { user_id: string }).user_id;
        return new Map(acc).set(userId, (acc.get(userId) ?? 0) + 1);
      }, new Map());

      return [...perUser.values()].filter((count) => count > 1).length;
    },

    async clusterMemberIds(clusterId) {
      // Service role: `demand_cluster_members` has no policy and these ids are only ever
      // passed to notify() (privacy invariant 1).
      const service = serviceRole('the demand cohort');
      if (!service) return [];

      const { data, error } = await service
        .from('demand_cluster_members')
        .select('user_id')
        .eq('cluster_id', clusterId);
      if (error) {
        if (isMissingTable(error)) return [];
        throw toApiError(error, 'could not read the cohort');
      }
      return (data ?? []).map((row) => (row as { user_id: string }).user_id);
    },

    async candidateRows(args) {
      const { data, error } = await db.rpc('business_candidates', {
        p_category: args.category,
        p_cohort_size: args.cohortSize,
        p_lat: args.lat,
        p_lng: args.lng,
        p_radius_km: args.radiusKm,
      });
      if (error) throw toApiError(error, 'could not search for venues');
      return (data ?? []) as CandidateRow[];
    },

    async insightClusters(args) {
      const since = new Date(Date.now() - args.sinceDays * 24 * 60 * 60 * 1000).toISOString();
      const service = serviceRole('the local demand aggregate');
      if (!service) return [];

      const { data, error } = await service
        .from('demand_clusters')
        .select('category, slot, member_count, center_lat, center_lng, created_at')
        .gte('created_at', since);
      if (error) {
        if (isMissingTable(error)) return [];
        throw toApiError(error, 'could not read the local demand');
      }

      type Raw = { category: string; slot: string; member_count: number; center_lat: number; center_lng: number };
      const degrees = args.radiusKm / 111; // 1 degree of latitude is about 111 km
      return (data as Raw[])
        .filter(
          (row) =>
            Math.abs(row.center_lat - args.lat) <= degrees && Math.abs(row.center_lng - args.lng) <= degrees,
        )
        .map(({ category, slot, member_count }): InsightCluster => ({ category, slot, member_count }));
    },
  };
}
