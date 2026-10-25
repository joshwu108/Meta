import 'server-only';
import type { AvailabilitySlot, EventCategory, EventStatus } from '@/shared/enums';
import type {
  AttendeeEntry,
  AttendeeList,
  BusinessEvent,
  BusinessInsights,
  BusinessPublicCard,
  InsightCell,
  ProposalDemand,
} from '@/shared/types';
import { toDemandBand } from './demand-band';

/**
 * Every value that crosses from a 05 server module into an HTTP response is built here, so
 * the privacy rules live in one place: no user ids, no raw cohort counts, no non-consented
 * names (specs/README.md section 3; spec section 10 criterion 3).
 */

type RawInterest = { tag: string; count: number };

export type DemandInput = {
  memberCount: number;
  neighborhoodLabel: string;
  topInterests: readonly RawInterest[];
};

/** Returns null when the cohort is below `MIN_COHORT_SIZE` — the caller shows nothing. */
export function buildProposalDemand(input: DemandInput): ProposalDemand | null {
  const band = toDemandBand(input.memberCount);
  if (band === null) return null;
  return {
    band,
    neighborhoodLabel: input.neighborhoodLabel,
    topInterests: input.topInterests.slice(0, 5).map((i) => i.tag),
  };
}

export type InsightsInput = {
  withinKm: number;
  sinceDays: number;
  clusters: readonly { category: EventCategory; slot: AvailabilitySlot; memberCount: number }[];
};

/** Clusters sharing a category and slot are summed, then banded once. */
export function buildInsights(input: InsightsInput): BusinessInsights {
  const totals = new Map<string, { category: EventCategory; slot: AvailabilitySlot; count: number }>();
  for (const cluster of input.clusters) {
    const key = `${cluster.category}|${cluster.slot}`;
    const current = totals.get(key);
    totals.set(key, {
      category: cluster.category,
      slot: cluster.slot,
      count: (current?.count ?? 0) + cluster.memberCount,
    });
  }

  const cells = [...totals.values()].reduce<InsightCell[]>((acc, entry) => {
    const band = toDemandBand(entry.count);
    return band === null ? acc : [...acc, { category: entry.category, slot: entry.slot, band }];
  }, []);

  return { withinKm: input.withinKm, sinceDays: input.sinceDays, cells };
}

export type BusinessRow = {
  id: string;
  name: string;
  category: string;
  neighborhood: string | null;
  address: string;
  description: string | null;
  image_url: string | null;
};

/** Spec section 5: no owner id, no capability notes. */
export function buildBusinessPublicCard(row: BusinessRow): BusinessPublicCard {
  return {
    id: row.id,
    name: row.name,
    category: row.category as EventCategory,
    neighborhood: row.neighborhood ?? '',
    address: row.address,
    description: row.description ?? '',
    imageUrl: row.image_url,
  };
}

export type EventRow = {
  id: string;
  business_id: string;
  proposal_id: string | null;
  source: string;
  title: string;
  description: string;
  category: string;
  format: string | null;
  starts_at: string;
  ends_at: string;
  capacity: number;
  price_cents: number | null;
  status: string;
  published_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
};

export function buildBusinessEvent(row: EventRow, confirmedCount: number): BusinessEvent {
  return {
    id: row.id,
    businessId: row.business_id,
    proposalId: row.proposal_id,
    source: row.source as BusinessEvent['source'],
    title: row.title,
    description: row.description,
    category: row.category as EventCategory,
    format: row.format,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    capacity: row.capacity,
    priceCents: row.price_cents,
    status: row.status as EventStatus,
    publishedAt: row.published_at,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
    confirmedCount,
  };
}

export type RsvpRow = {
  status: string;
  share_with_business: boolean;
  display_name: string | null;
  shared_interests?: readonly string[] | null;
};

/**
 * Spec section 7, Screen 5: counts first, then the consented list. A non-consenting
 * attendee becomes `{ displayName: null }` and the UI renders "Attendee (private)".
 * No user id is ever included.
 */
export function buildAttendeeList(rows: readonly RsvpRow[]): AttendeeList {
  const confirmed = rows.filter((r) => r.status === 'confirmed');
  const attendees: AttendeeEntry[] = confirmed.map((row) =>
    row.share_with_business && row.display_name
      ? {
          displayName: row.display_name,
          ...(row.shared_interests?.length ? { sharedInterests: [...row.shared_interests] } : {}),
        }
      : { displayName: null },
  );

  return {
    confirmedCount: confirmed.length,
    waitlistedCount: rows.filter((r) => r.status === 'waitlisted').length,
    attendees,
  };
}
