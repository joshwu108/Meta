import { describe, expect, it } from 'vitest';
import { thresholdAndRank } from '@/features/demand/server/aggregate';
import { clusterUsers, filterUsers } from '@/features/demand/server/cluster';
import { DEMAND_CONFIG } from '@/features/demand/server/config';
import { localTimeInZone, nextSlotStart, weekdayInZone } from '@/features/demand/server/time';
import { findForbiddenPhrases, validateProposal } from '@/features/demand/server/validate';
import { ProposalDocument } from '@/features/demand/schemas';
import fixture from '@/lib/ai/fixtures/demand.generate_proposal.json';
import { consentingUsers, NOW, VENUES } from './harness';

const { kept } = thresholdAndRank(clusterUsers(filterUsers(consentingUsers()), DEMAND_CONFIG), DEMAND_CONFIG);
const creative = kept.find((c) => c.category === 'creative' && c.slot === 'thu_eve')!;
const kiln = VENUES[0]!;
const doc = ProposalDocument.parse(fixture);

const validate = (overrides: Partial<ProposalDocument> = {}, venue = kiln) =>
  validateProposal({ ...doc, ...overrides }, creative, venue, NOW, DEMAND_CONFIG);

describe('validateProposal', () => {
  it('accepts the Scene 3 fixture and stores a concrete start', () => {
    const result = validate();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposal.disclaimers).toEqual(['demand_is_estimate']);
    expect(result.proposal.assumptionsToValidate.length).toBeGreaterThan(0);
  });

  it('overwrites the band and demand fields from the cluster, never trusting the model', () => {
    const result = validate({ demand: { band: '20+', neighborhoodLabel: 'Somewhere', topInterests: ['invented'] } });
    expect(result.ok && result.proposal.demand).toEqual({ band: '6-9', neighborhoodLabel: creative.neighborhoodLabel, topInterests: creative.topInterests.map((t) => t.tag) });
  });

  it.each([
    [{ suggestedCapacity: 13 }, 'over_capacity'],
    [{ suggestedPriceCents: 4000 }, 'price_out_of_range'],
    [{ suggestedPriceCents: 1000 }, 'price_out_of_range'],
    [{ suggestedSlot: 'sat_day' as const }, 'slot_mismatch'],
    [{ category: 'games' as const }, 'category_mismatch'],
    [{ description: `${doc.description} Six people are confirmed.` }, 'forbidden_phrase'],
    [{ whySuggested: 'Everyone will attend.' }, 'forbidden_phrase'],
  ])('rejects %o', (overrides, issue) => {
    const result = validate(overrides);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain(issue);
  });

  it('rejects a slot the venue does not host', () => {
    const noThursday = { ...kiln, capabilities: { ...kiln.capabilities, hostingSlots: ['sat_day' as const] } };
    const result = validate({}, noThursday);
    expect(!result.ok && result.issues).toContain('slot_not_hosted');
  });

  it('falls back to 1.5x the cluster budget when the venue has no price range', () => {
    const open = { ...kiln, capabilities: { ...kiln.capabilities, minPriceCents: null, maxPriceCents: null } };
    const ceiling = Math.round((creative.budgetP50Cents ?? 0) * 1.5);
    expect(validate({ suggestedPriceCents: ceiling }, open).ok).toBe(true);
    expect(validate({ suggestedPriceCents: ceiling + 1 }, open).ok).toBe(false);
  });
});

describe('findForbiddenPhrases', () => {
  it('matches whole words only', () => {
    expect(findForbiddenPhrases('Unconfirmed interest, nothing booked')).toEqual(['booked']);
  });
});

describe('nextSlotStart', () => {
  it('is at least 5 days out, on the slot weekday, at venue-local time', () => {
    const start = nextSlotStart('thu_eve', '18:00', NOW, 5);
    expect(start.getTime() - NOW.getTime()).toBeGreaterThanOrEqual(5 * 86_400_000);
    expect(weekdayInZone(start)).toBe(4);
    expect(localTimeInZone(start)).toBe('18:00');
    // Thu 5 Nov 18:00 PST (DST ended 1 Nov) = 02:00Z on the 6th
    expect(start.toISOString()).toBe('2026-11-06T02:00:00.000Z');
  });

  it('never gives less than 5 full days of lead time (Saturday-evening run)', () => {
    // Sat 24 Oct 19:30 PDT. Thu 29 Oct 18:00 is 5 calendar days away but only 4d 22.5h.
    const now = new Date('2026-10-25T02:30:00Z');
    const start = nextSlotStart('thu_eve', '18:00', now, 5);
    expect(start.getTime() - now.getTime()).toBeGreaterThanOrEqual(5 * 86_400_000);
    expect(start.toISOString()).toBe('2026-11-06T02:00:00.000Z');
  });

  it('keeps a slot exactly 5 days and some hours out', () => {
    // Sat 24 Oct 10:00 PDT → Thu 29 Oct 18:00 PDT is 5d 8h away.
    expect(nextSlotStart('thu_eve', '18:00', new Date('2026-10-24T17:00:00Z'), 5).toISOString()).toBe('2026-10-30T01:00:00.000Z');
  });

  it.each([
    ['fall-back (1 Nov 2026)', '2026-10-20T00:00:00Z', '2026-11-03T00:00:00Z'],
    ['spring-forward (8 Mar 2026)', '2026-02-28T00:00:00Z', '2026-03-12T00:00:00Z'],
  ])('finds every slot from any hour around %s', (_label, from, to) => {
    const slots = ['mon_eve', 'tue_eve', 'wed_eve', 'thu_eve', 'fri_eve', 'sat_day', 'sat_eve', 'sun_day', 'sun_eve'] as const;
    const weekday = { mon_eve: 1, tue_eve: 2, wed_eve: 3, thu_eve: 4, fri_eve: 5, sat_day: 6, sat_eve: 6, sun_day: 0, sun_eve: 0 } as const;
    for (let t = Date.parse(from); t < Date.parse(to); t += 3 * 3_600_000 + 17 * 60_000) {
      const now = new Date(t);
      for (const slot of slots) {
        const start = nextSlotStart(slot, '18:00', now, 5);
        const lead = start.getTime() - t;
        expect(weekdayInZone(start), `${slot} from ${now.toISOString()}`).toBe(weekday[slot]);
        expect(localTimeInZone(start)).toBe('18:00');
        expect(lead).toBeGreaterThanOrEqual(5 * 86_400_000);
        expect(lead).toBeLessThan(12 * 86_400_000 + 3_600_000);
      }
    }
  });

  it('works today (05 report: threw for thu_eve on 2026-10-25)', () => {
    expect(() => nextSlotStart('thu_eve', '18:00', new Date('2026-10-25T07:30:00Z'), 5)).not.toThrow();
  });

  it('handles weekend day slots and DST', () => {
    const start = nextSlotStart('sat_day', '11:00', new Date('2026-10-28T12:00:00Z'), 5);
    expect(weekdayInZone(start)).toBe(6);
    expect(start.toISOString()).toBe('2026-11-07T19:00:00.000Z');
  });
});
