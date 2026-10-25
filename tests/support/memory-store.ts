import type { CandidateRow } from '@/features/business/server/candidates';
import type { EventRow, RsvpRow } from '@/features/business/server/dto';
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
} from '@/features/business/server/store';
import { ALLOWED_EVENT_TRANSITIONS } from '@/features/business/server/status-machine';
import type { EventStatus } from '@/shared/enums';

/**
 * An in-memory `BusinessStore` for unit tests. It reproduces the three guarantees the
 * database provides, so a use-case test that passes here means something:
 *   - the event status machine (trigger `events_status_guard` + `event_transition_allowed`)
 *   - the atomicity of `decide_proposal` (a failure leaves nothing behind)
 *   - the one-business-per-owner unique index
 *
 * RLS is deliberately *not* modelled; owner-only access is asserted by the integration
 * tests against the real policies.
 */
export class MemoryBusinessStore implements BusinessStore {
  private businesses: BusinessRow[] = [];
  private capabilities: CapabilitiesRow[] = [];
  private events: EventRow[] = [];
  private proposals: ProposalRow[] = [];
  private rsvps: (RsvpRow & { event_id: string; user_id: string })[] = [];
  private clusters = new Map<string, string[]>();
  private candidates: CandidateRow[] = [];
  private insights: InsightCluster[] = [];
  private sequence = 0;

  /** Set to a message to make the next `decideProposal` throw after the proposal update. */
  failAfterProposalUpdate: string | null = null;

  private id(prefix: string): string {
    this.sequence += 1;
    return `${prefix}-${this.sequence}`;
  }

  /* ---------------------------------------------------------------- seeding */

  seedBusiness(
    business: Partial<BusinessRow> & { owner_id: string },
    capabilities: Partial<Omit<NewCapabilities, 'business_id'>> = {},
  ): { business: BusinessRow; capabilities: CapabilitiesRow } {
    const row: BusinessRow = {
      id: business.id ?? this.id('biz'),
      owner_id: business.owner_id,
      name: business.name ?? 'Kiln & Cup',
      slug: business.slug ?? 'kiln-cup',
      description: business.description ?? 'Pottery studio and coffee bar',
      category: business.category ?? 'creative',
      address: business.address ?? '1 Valencia St',
      neighborhood: business.neighborhood ?? 'Mission',
      lat: business.lat ?? 37.7599,
      lng: business.lng ?? -122.4148,
      image_url: business.image_url ?? null,
      hours: business.hours ?? { thu: [['09:00', '21:00']], sat: [['10:00', '18:00']] },
      is_active: business.is_active ?? true,
    };
    const caps: CapabilitiesRow = {
      business_id: row.id,
      event_categories: capabilities.event_categories ?? ['creative', 'food_drink'],
      capacity: capabilities.capacity ?? 12,
      min_price_cents: capabilities.min_price_cents ?? 1500,
      max_price_cents: capabilities.max_price_cents ?? 3500,
      hosting_slots: capabilities.hosting_slots ?? ['thu_eve', 'sat_day'],
      equipment_tags: capabilities.equipment_tags ?? ['pottery-wheels', 'kiln'],
      formats: capabilities.formats ?? ['workshop'],
      notes: capabilities.notes ?? null,
      accepts_ai_proposals: capabilities.accepts_ai_proposals ?? true,
    };
    this.businesses = [...this.businesses, row];
    this.capabilities = [...this.capabilities, caps];
    return { business: row, capabilities: caps };
  }

  seedProposal(proposal: Omit<ProposalRow, 'id'> & { id?: string }): ProposalRow {
    const row: ProposalRow = { ...proposal, id: proposal.id ?? this.id('prop') };
    this.proposals = [...this.proposals, row];
    return row;
  }

  seedEvent(event: NewEvent, status: EventStatus = 'approved_draft'): EventRow {
    const row: EventRow = {
      id: this.id('evt'),
      ...event,
      status,
      published_at: status === 'published' ? new Date().toISOString() : null,
      cancelled_at: null,
      cancel_reason: null,
    };
    this.events = [...this.events, row];
    return row;
  }

  seedRsvp(eventId: string, rsvp: Partial<RsvpRow> & { user_id: string }): void {
    this.rsvps = [
      ...this.rsvps,
      {
        event_id: eventId,
        user_id: rsvp.user_id,
        status: rsvp.status ?? 'confirmed',
        share_with_business: rsvp.share_with_business ?? false,
        display_name: rsvp.display_name ?? null,
        shared_interests: rsvp.shared_interests ?? null,
      },
    ];
  }

  seedCluster(clusterId: string, memberIds: readonly string[]): void {
    this.clusters.set(clusterId, [...memberIds]);
  }

  seedCandidates(rows: readonly CandidateRow[]): void {
    this.candidates = [...rows];
  }

  seedInsights(rows: readonly InsightCluster[]): void {
    this.insights = [...rows];
  }

  snapshotEvents(): readonly EventRow[] {
    return this.events;
  }

  snapshotProposals(): readonly ProposalRow[] {
    return this.proposals;
  }

  /* ---------------------------------------------------------- businesses */

  async findBusinessByOwner(ownerId: string) {
    return this.businesses.find((b) => b.owner_id === ownerId) ?? null;
  }

  async findBusinessById(businessId: string) {
    return this.businesses.find((b) => b.id === businessId) ?? null;
  }

  async findCapabilities(businessId: string) {
    return this.capabilities.find((c) => c.business_id === businessId) ?? null;
  }

  async createBusiness(business: NewBusiness, capabilities: Omit<NewCapabilities, 'business_id'>) {
    if (this.businesses.some((b) => b.owner_id === business.owner_id)) {
      throw new Error('duplicate key value violates unique constraint "businesses_owner"');
    }
    const { business: row } = this.seedBusiness({ ...business }, capabilities);
    return row;
  }

  async updateBusiness(businessId: string, patch: Partial<NewBusiness>) {
    const current = await this.findBusinessById(businessId);
    if (!current) throw new Error(`no business ${businessId}`);
    const next = { ...current, ...patch };
    this.businesses = this.businesses.map((b) => (b.id === businessId ? next : b));
    return next;
  }

  async updateCapabilities(businessId: string, patch: Partial<Omit<NewCapabilities, 'business_id'>>) {
    const current = await this.findCapabilities(businessId);
    if (!current) throw new Error(`no capabilities for ${businessId}`);
    const next = { ...current, ...patch };
    this.capabilities = this.capabilities.map((c) => (c.business_id === businessId ? next : c));
    return next;
  }

  async slugExists(slug: string) {
    return this.businesses.some((b) => b.slug === slug);
  }

  /* -------------------------------------------------------------- events */

  async listEventsForBusiness(businessId: string) {
    return this.events
      .filter((e) => e.business_id === businessId)
      .slice()
      .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  }

  async findEvent(eventId: string) {
    return this.events.find((e) => e.id === eventId) ?? null;
  }

  async createEvent(event: NewEvent, status: EventStatus) {
    return this.seedEvent(event, status);
  }

  async updateEventDetails(eventId: string, patch: EventDetailsPatch) {
    const current = await this.findEvent(eventId);
    if (!current) throw new Error(`no event ${eventId}`);
    const next = { ...current, ...patch };
    this.events = this.events.map((e) => (e.id === eventId ? next : e));
    return next;
  }

  private transition(eventId: string, to: EventStatus, extra: Partial<EventRow> = {}): void {
    const current = this.events.find((e) => e.id === eventId);
    if (!current) throw new Error(`no event ${eventId}`);
    const allowed: readonly EventStatus[] = ALLOWED_EVENT_TRANSITIONS[current.status as EventStatus];
    if (!allowed.includes(to)) {
      throw new Error(`${current.status} -> ${to} is not a legal event transition`);
    }
    const next: EventRow = {
      ...current,
      ...extra,
      status: to,
      published_at: to === 'published' ? (current.published_at ?? new Date().toISOString()) : current.published_at,
      cancelled_at: to === 'cancelled' ? new Date().toISOString() : current.cancelled_at,
    };
    this.events = this.events.map((e) => (e.id === eventId ? next : e));
  }

  async publishEvent(eventId: string) {
    this.transition(eventId, 'published');
  }

  async cancelEvent(eventId: string, reason: string) {
    this.transition(eventId, 'cancelled', { cancel_reason: reason });
  }

  /* ----------------------------------------------------------- proposals */

  async listProposals(businessId: string, status?: ProposalRow['status']) {
    return this.proposals
      .filter((p) => p.business_id === businessId && (status === undefined || p.status === status))
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async findProposal(proposalId: string) {
    return this.proposals.find((p) => p.id === proposalId) ?? null;
  }

  /** Atomic: a failure after the proposal update rolls both writes back. */
  async decideProposal(args: DecideProposalArgs): Promise<DecideProposalResult> {
    const proposalsBefore = this.proposals;
    const eventsBefore = this.events;

    try {
      const proposal = this.proposals.find((p) => p.id === args.proposalId);
      if (!proposal) throw new Error(`no proposal ${args.proposalId}`);
      if (proposal.status !== 'pending') throw new Error(`proposal was already ${proposal.status}`);

      if (args.decision === 'reject') {
        this.proposals = this.proposals.map((p) =>
          p.id === args.proposalId
            ? { ...p, status: 'rejected', decision_note: args.note, decided_at: new Date().toISOString() }
            : p,
        );
        return { proposalId: args.proposalId, status: 'rejected', eventId: null };
      }

      if (!args.event) throw new Error('approving a proposal requires resolved event fields');
      const event = this.seedEvent(args.event, 'approved_draft');
      const status = args.decision === 'approve' ? 'approved' : 'modified';

      this.proposals = this.proposals.map((p) =>
        p.id === args.proposalId
          ? {
              ...p,
              status,
              decision_note: args.note,
              decided_at: new Date().toISOString(),
              business_edits: args.edits,
              resulting_event_id: event.id,
            }
          : p,
      );

      if (this.failAfterProposalUpdate) {
        throw new Error(this.failAfterProposalUpdate);
      }

      return { proposalId: args.proposalId, status, eventId: event.id };
    } catch (error) {
      this.proposals = proposalsBefore;
      this.events = eventsBefore;
      throw error;
    }
  }

  /* --------------------------------------------------------------- rsvps */

  async listRsvps(eventId: string): Promise<RsvpRow[]> {
    return this.rsvps
      .filter((r) => r.event_id === eventId)
      .map(({ status, share_with_business, display_name, shared_interests }) => ({
        status,
        share_with_business,
        display_name,
        shared_interests,
      }));
  }

  async countConfirmed(eventId: string) {
    return this.rsvps.filter((r) => r.event_id === eventId && r.status === 'confirmed').length;
  }

  async confirmedRsvpUserIds(eventId: string) {
    return this.rsvps.filter((r) => r.event_id === eventId && r.status === 'confirmed').map((r) => r.user_id);
  }

  async countRepeatAttendees(eventIds: readonly string[]) {
    const scope = new Set(eventIds);
    const perUser = new Map<string, number>();
    for (const rsvp of this.rsvps) {
      if (rsvp.status !== 'confirmed' || !scope.has(rsvp.event_id)) continue;
      perUser.set(rsvp.user_id, (perUser.get(rsvp.user_id) ?? 0) + 1);
    }
    return [...perUser.values()].filter((count) => count > 1).length;
  }

  /* ------------------------------------------------------- service role */

  async clusterMemberIds(clusterId: string) {
    return this.clusters.get(clusterId) ?? [];
  }

  async candidateRows() {
    return this.candidates;
  }

  async insightClusters() {
    return this.insights;
  }
}
