import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProposalDocument } from '@/features/demand/schemas';
import type { GenerateInput } from '@/features/demand/server/deps';
import type { ReviseInput } from '@/features/demand/server/revise';
import { capabilitySummary } from '@/features/demand/server/venue';
import fixture from '@/lib/ai/fixtures/demand.generate_proposal.json';
import { VENUES } from './harness';

vi.mock('server-only', () => ({}));

const { generateProposal, generateRevision } = await import('@/features/demand/server/generate');

const [KILN, , MEEPLE] = VENUES as [typeof VENUES[0], typeof VENUES[1], typeof VENUES[2]];
const PREVIOUS = { ...(fixture as ProposalDocument), disclaimers: ['demand_is_estimate'] } as ProposalDocument;

function input(category: GenerateInput['brief']['category'], slot: GenerateInput['brief']['slot'], venue = KILN): GenerateInput {
  return {
    brief: { category, slot, neighborhoodLabel: 'Mission District', demandBand: '6-9', topInterests: [{ tag: 'pottery', count: 4 }], groupSizeMode: 'small', budgetP50Cents: 2000, activityPrefs: [] },
    business: venue.card,
    capabilities: capabilitySummary(venue),
  };
}

function revision(slot: ReviseInput['changes']['slot']): ReviseInput {
  return { previous: PREVIOUS, changes: { priceCents: null, capacity: 8, slot }, ownerNote: 'smaller', business: KILN.card, capabilities: capabilitySummary(KILN) };
}

describe('generate under MOCK_AI', () => {
  const before = process.env.MOCK_AI;
  beforeEach(() => {
    process.env.MOCK_AI = '1';
  });
  afterEach(() => {
    process.env.MOCK_AI = before;
  });

  it('uses the Scene 3 fixture when it fits the brief', async () => {
    expect((await generateProposal(input('creative', 'thu_eve'))).title).toBe('Beginner Pottery & Coffee Night');
  });

  it('falls back to a deterministic template for other briefs', async () => {
    const doc = await generateProposal(input('games', 'fri_eve', MEEPLE));
    expect(doc).toMatchObject({ category: 'games', suggestedSlot: 'fri_eve' });
    expect(doc.title).toContain('Meeple House');
  });

  it('uses the revise fixture when the slot is unchanged', async () => {
    expect((await generateRevision(revision(null))).title).toBe('Small-Group Pottery & Coffee Night');
  });

  it('keeps the previous draft when the owner moves the slot (overrides are applied later)', async () => {
    expect(await generateRevision(revision('fri_eve'))).toEqual(PREVIOUS);
  });
});
