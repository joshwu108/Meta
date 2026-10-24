import { describe, expect, it } from 'vitest';
import type { ApiError } from '@/lib/api/errors';
import type { BusinessCapabilities, ProposalDocument, WeeklyHours } from '@/shared/types';
import {
  applyEditsToEvent,
  assertCapacityNotBelowConfirmed,
  resolveEventFromProposal,
  validateEventAgainstCapabilities,
} from '@/features/business/server/validate';

const capabilities: BusinessCapabilities = {
  eventCategories: ['creative', 'food_drink'],
  capacity: 12,
  minPriceCents: 1500,
  maxPriceCents: 3500,
  hostingSlots: ['thu_eve', 'sat_day'],
  equipmentTags: ['pottery-wheels', 'kiln'],
  formats: ['workshop'],
  notes: 'Two staff on Thursdays',
  acceptsAiProposals: true,
};

const hours: WeeklyHours = {
  mon: [['09:00', '17:00']],
  thu: [['09:00', '21:00']],
  sat: [['10:00', '18:00']],
};

const proposal: ProposalDocument = {
  title: 'Beginner Pottery & Coffee Night',
  description: 'A guided wheel-throwing session for complete beginners, then coffee and talk.',
  category: 'creative',
  format: 'Guided 60-min beginner session, then 45 min open conversation',
  intendedSocialExperience: 'Low-pressure, hands busy, easy conversation',
  suggestedSlot: 'thu_eve',
  suggestedStartTimeLocal: '18:30',
  estimatedDurationMinutes: 105,
  suggestedCapacity: 8,
  suggestedPriceCents: 2000,
  priceRangeCents: { min: 1500, max: 3500 },
  demand: { band: '6-9', neighborhoodLabel: 'Mission', topInterests: ['pottery', 'coffee'] },
  whySuggested: 'Six people nearby are interested in creative activities on Thursday evenings.',
  assumptionsToValidate: ['Studio has 8 wheels', 'Staff available Thursday 6-8pm'],
  disclaimers: ['demand_is_estimate'],
};

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (err) {
    return (err as ApiError).code;
  }
  return undefined;
};

describe('resolveEventFromProposal', () => {
  const from = new Date('2026-10-26T12:00:00Z'); // Monday

  it('turns a proposal into concrete event fields', () => {
    const fields = resolveEventFromProposal(proposal, undefined, { from, timezone: 'UTC' });
    expect(fields).toEqual({
      title: proposal.title,
      description: proposal.description,
      category: 'creative',
      format: proposal.format,
      startsAt: '2026-10-29T18:30:00.000Z',
      endsAt: '2026-10-29T20:15:00.000Z',
      capacity: 8,
      priceCents: 2000,
    });
  });

  it('lets the owner override any field', () => {
    const fields = resolveEventFromProposal(
      proposal,
      { capacity: 10, priceCents: 2500, title: 'Pottery & Pour', startsAt: '2026-10-29T18:00:00.000Z' },
      { from, timezone: 'UTC' },
    );
    expect(fields.capacity).toBe(10);
    expect(fields.priceCents).toBe(2500);
    expect(fields.title).toBe('Pottery & Pour');
    expect(fields.startsAt).toBe('2026-10-29T18:00:00.000Z');
  });

  it('keeps the proposed duration when the owner moves only the start time', () => {
    const fields = resolveEventFromProposal(proposal, { startsAt: '2026-10-29T17:00:00.000Z' }, {
      from,
      timezone: 'UTC',
    });
    expect(fields.endsAt).toBe('2026-10-29T18:45:00.000Z');
  });

  it('accepts an explicit end time', () => {
    const fields = resolveEventFromProposal(
      proposal,
      { startsAt: '2026-10-29T17:00:00.000Z', endsAt: '2026-10-29T19:30:00.000Z' },
      { from, timezone: 'UTC' },
    );
    expect(fields.endsAt).toBe('2026-10-29T19:30:00.000Z');
  });

  it('can clear the price to free', () => {
    const fields = resolveEventFromProposal(proposal, { priceCents: null }, { from, timezone: 'UTC' });
    expect(fields.priceCents).toBeNull();
  });
});

/** Spec section 9, T-U2. */
describe('validateEventAgainstCapabilities', () => {
  const base = {
    title: proposal.title,
    description: proposal.description,
    category: 'creative' as const,
    format: proposal.format,
    startsAt: '2026-10-29T18:30:00.000Z',
    endsAt: '2026-10-29T20:15:00.000Z',
    capacity: 8,
    priceCents: 2000,
  };

  it('accepts an event inside capacity and opening hours', () => {
    expect(() =>
      validateEventAgainstCapabilities(base, capabilities, hours, { timezone: 'UTC' }),
    ).not.toThrow();
  });

  it('rejects a capacity above what the venue can host', () => {
    expect(codeOf(() =>
      validateEventAgainstCapabilities({ ...base, capacity: 13 }, capabilities, hours, { timezone: 'UTC' }),
    )).toBe('VALIDATION');
  });

  it('accepts a capacity exactly at the venue limit', () => {
    expect(() =>
      validateEventAgainstCapabilities({ ...base, capacity: 12 }, capabilities, hours, { timezone: 'UTC' }),
    ).not.toThrow();
  });

  it('rejects a category the venue does not host', () => {
    expect(codeOf(() =>
      validateEventAgainstCapabilities({ ...base, category: 'games' }, capabilities, hours, { timezone: 'UTC' }),
    )).toBe('VALIDATION');
  });

  it('rejects a start before the venue opens', () => {
    expect(codeOf(() =>
      validateEventAgainstCapabilities(
        { ...base, startsAt: '2026-10-29T07:00:00.000Z', endsAt: '2026-10-29T08:00:00.000Z' },
        capabilities,
        hours,
        { timezone: 'UTC' },
      ),
    )).toBe('VALIDATION');
  });

  it('rejects an end after the venue closes', () => {
    expect(codeOf(() =>
      validateEventAgainstCapabilities(
        { ...base, startsAt: '2026-10-29T20:30:00.000Z', endsAt: '2026-10-29T22:00:00.000Z' },
        capabilities,
        hours,
        { timezone: 'UTC' },
      ),
    )).toBe('VALIDATION');
  });

  it('rejects a day the venue is closed', () => {
    expect(codeOf(() =>
      validateEventAgainstCapabilities(
        { ...base, startsAt: '2026-10-28T18:30:00.000Z', endsAt: '2026-10-28T20:00:00.000Z' },
        capabilities,
        hours,
        { timezone: 'UTC' },
      ),
    )).toBe('VALIDATION');
  });

  it('skips the hours check when the venue published no hours', () => {
    expect(() =>
      validateEventAgainstCapabilities(base, capabilities, {}, { timezone: 'UTC' }),
    ).not.toThrow();
  });

  it('rejects an event that ends before it starts', () => {
    expect(codeOf(() =>
      validateEventAgainstCapabilities(
        { ...base, startsAt: '2026-10-29T20:00:00.000Z', endsAt: '2026-10-29T19:00:00.000Z' },
        capabilities,
        hours,
        { timezone: 'UTC' },
      ),
    )).toBe('VALIDATION');
  });

  it('collects every problem in the error details', () => {
    try {
      validateEventAgainstCapabilities(
        { ...base, capacity: 99, category: 'games' },
        capabilities,
        hours,
        { timezone: 'UTC' },
      );
      expect.unreachable('should have thrown');
    } catch (err) {
      const details = (err as ApiError).details as { field: string }[];
      expect(details.map((d) => d.field).sort()).toEqual(['capacity', 'category']);
    }
  });
});

/** Spec section 9, T-U3 and section 10 criterion 5. */
describe('assertCapacityNotBelowConfirmed', () => {
  it('allows a capacity equal to the confirmed count', () => {
    expect(() => assertCapacityNotBelowConfirmed(6, 6)).not.toThrow();
  });

  it('allows an increase', () => {
    expect(() => assertCapacityNotBelowConfirmed(10, 6)).not.toThrow();
  });

  it('rejects shrinking below the confirmed count', () => {
    expect(codeOf(() => assertCapacityNotBelowConfirmed(5, 6))).toBe('VALIDATION');
  });

  it('names the confirmed count in the message so the owner knows the floor', () => {
    try {
      assertCapacityNotBelowConfirmed(2, 6);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as Error).message).toMatch(/6/);
    }
  });
});

describe('applyEditsToEvent', () => {
  const current = {
    title: 'Open Studio Evening',
    description: 'Drop in and throw a pot.',
    category: 'creative' as const,
    format: 'Open studio',
    startsAt: '2026-10-29T18:00:00.000Z',
    endsAt: '2026-10-29T20:00:00.000Z',
    capacity: 10,
    priceCents: 1800,
  };

  it('returns the event unchanged for an empty edit', () => {
    expect(applyEditsToEvent(current, {})).toEqual(current);
  });

  it('never mutates the event it was given', () => {
    const snapshot = { ...current };
    applyEditsToEvent(current, { title: 'Something else', capacity: 2 });
    expect(current).toEqual(snapshot);
  });

  it('applies each field on its own and touches nothing else', () => {
    const cases = [
      { edit: { title: 'Pottery & Pour' }, field: 'title' },
      { edit: { description: 'A new description.' }, field: 'description' },
      { edit: { format: 'Guided session' }, field: 'format' },
      { edit: { startsAt: '2026-10-29T17:00:00.000Z' }, field: 'startsAt' },
      { edit: { endsAt: '2026-10-29T21:00:00.000Z' }, field: 'endsAt' },
      { edit: { capacity: 6 }, field: 'capacity' },
      { edit: { priceCents: 2500 }, field: 'priceCents' },
    ] as const;

    for (const { edit, field } of cases) {
      const next = applyEditsToEvent(current, edit);
      expect(next).toEqual({ ...current, ...edit });
      expect(Object.keys(next)).toEqual(Object.keys(current));
      expect(next[field]).not.toBe(current[field]);
    }
  });

  it('distinguishes clearing the price from leaving it alone', () => {
    expect(applyEditsToEvent(current, { priceCents: null }).priceCents).toBeNull();
    expect(applyEditsToEvent(current, {}).priceCents).toBe(1800);
  });

  it('never changes the category, which the owner cannot edit', () => {
    expect(applyEditsToEvent(current, { title: 'x' }).category).toBe('creative');
  });
});
