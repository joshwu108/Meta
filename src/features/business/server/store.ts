import 'server-only';
import type { EventStatus, ProposalStatus } from '@/shared/enums';
import type { EventEdits, ProposalDocument, WeeklyHours } from '@/shared/types';
import type { CandidateRow } from './candidates';
import type { EventRow, RsvpRow } from './dto';

/**
 * The repository port for workstream 05. Every use case talks to this interface, never to
 * `supabase-js` directly, so the domain logic is unit-testable against the in-memory store
 * in tests/support/memory-store.ts and the RLS behaviour is pinned by integration tests
 * against the real one.
 */

export type BusinessRow = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  address: string;
  neighborhood: string | null;
  lat: number;
  lng: number;
  image_url: string | null;
  hours: WeeklyHours;
  is_active: boolean;
};

export type CapabilitiesRow = {
  business_id: string;
  event_categories: string[];
  capacity: number;
  min_price_cents: number | null;
  max_price_cents: number | null;
  hosting_slots: string[];
  equipment_tags: string[];
  formats: string[];
  notes: string | null;
  accepts_ai_proposals: boolean;
};

export type ProposalRow = {
  id: string;
  business_id: string;
  cluster_id: string | null;
  status: ProposalStatus;
  proposal: ProposalDocument;
  business_edits: EventEdits | null;
  decision_note: string | null;
  decided_at: string | null;
  resulting_event_id: string | null;
  expires_at: string;
  created_at: string;
};

export type NewBusiness = Omit<BusinessRow, 'id'>;
export type NewCapabilities = CapabilitiesRow;

export type NewEvent = {
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
};

export type EventDetailsPatch = Partial<
  Pick<NewEvent, 'title' | 'description' | 'format' | 'starts_at' | 'ends_at' | 'capacity' | 'price_cents'>
>;

export type DecideProposalArgs = {
  proposalId: string;
  decision: 'approve' | 'modify' | 'reject';
  edits: EventEdits | null;
  note: string | null;
  event: NewEvent | null;
};

export type DecideProposalResult = {
  proposalId: string;
  status: ProposalStatus;
  eventId: string | null;
};

export type InsightCluster = {
  category: string;
  slot: string;
  member_count: number;
};

export interface BusinessStore {
  /* businesses */
  findBusinessByOwner(ownerId: string): Promise<BusinessRow | null>;
  findBusinessById(businessId: string): Promise<BusinessRow | null>;
  findCapabilities(businessId: string): Promise<CapabilitiesRow | null>;
  createBusiness(business: NewBusiness, capabilities: Omit<NewCapabilities, 'business_id'>): Promise<BusinessRow>;
  updateBusiness(businessId: string, patch: Partial<NewBusiness>): Promise<BusinessRow>;
  updateCapabilities(businessId: string, patch: Partial<Omit<NewCapabilities, 'business_id'>>): Promise<CapabilitiesRow>;
  slugExists(slug: string): Promise<boolean>;

  /* events */
  listEventsForBusiness(businessId: string): Promise<EventRow[]>;
  findEvent(eventId: string): Promise<EventRow | null>;
  createEvent(event: NewEvent, status: EventStatus): Promise<EventRow>;
  updateEventDetails(eventId: string, patch: EventDetailsPatch): Promise<EventRow>;
  publishEvent(eventId: string): Promise<void>;
  cancelEvent(eventId: string, reason: string): Promise<void>;

  /* proposals */
  listProposals(businessId: string, status?: ProposalStatus): Promise<ProposalRow[]>;
  findProposal(proposalId: string): Promise<ProposalRow | null>;
  decideProposal(args: DecideProposalArgs): Promise<DecideProposalResult>;

  /* rsvps (workstream 06; absent until it lands) */
  listRsvps(eventId: string): Promise<RsvpRow[]>;
  countConfirmed(eventId: string): Promise<number>;
  /** Service-role read. The ids are used only to call notify() and never returned. */
  confirmedRsvpUserIds(eventId: string): Promise<string[]>;

  /**
   * How many distinct people have confirmed for more than one of this venue's finished
   * events. Service-role read: only the count is returned, never a user id (spec section 3,
   * P1 analytics).
   */
  countRepeatAttendees(businessId: string): Promise<number>;

  /* service-role only reads */
  clusterMemberIds(clusterId: string): Promise<string[]>;
  candidateRows(args: {
    category: string;
    cohortSize: number;
    lat: number;
    lng: number;
    radiusKm: number;
  }): Promise<CandidateRow[]>;
  insightClusters(args: { lat: number; lng: number; radiusKm: number; sinceDays: number }): Promise<InsightCluster[]>;
}
