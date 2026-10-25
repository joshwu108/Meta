import { describe, expect, it } from 'vitest';
import { AVAILABILITY_SLOT, EVENT_CATEGORY, EVENT_STATUS } from '@/shared/enums';
import {
  BAND_LABEL,
  CATEGORY_LABEL,
  SLOT_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  demandSentence,
} from '@/features/business/labels';
import { DEMAND_BANDS } from '@/features/business/server/demand-band';

/**
 * The copy layer. Two things are being guarded: every enum value has human copy (so no
 * screen can render a raw `food_drink`), and a band never appears as a bare number
 * (spec section 12 and design-system.md section 4).
 */
describe('enum copy is complete', () => {
  it('labels every event category', () => {
    for (const category of EVENT_CATEGORY) expect(CATEGORY_LABEL[category]).toBeTruthy();
  });

  it('labels every availability slot', () => {
    for (const slot of AVAILABILITY_SLOT) expect(SLOT_LABEL[slot]).toBeTruthy();
  });

  it('labels every event status', () => {
    for (const status of EVENT_STATUS) expect(STATUS_LABEL[status]).toBeTruthy();
  });

  it('labels every demand band', () => {
    for (const band of DEMAND_BANDS) expect(BAND_LABEL[band]).toBeTruthy();
  });
});

describe('status pill tones follow the design system', () => {
  it('maps published and confirmed to green, pending to amber, cancelled to red', () => {
    expect(STATUS_TONE.published).toBe('success');
    expect(STATUS_TONE.awaiting_approval).toBe('warning');
    expect(STATUS_TONE.cancelled).toBe('danger');
    expect(STATUS_TONE.approved_draft).toBe('neutral');
    expect(STATUS_TONE.full).toBe('info');
  });

  it('gives every status exactly one tone from the allowed set', () => {
    const allowed = ['neutral', 'info', 'success', 'warning', 'danger'];
    for (const status of EVENT_STATUS) expect(allowed).toContain(STATUS_TONE[status]);
  });
});

describe('demand copy never reads as a headcount', () => {
  it('always says the band as a range, never a single number', () => {
    const sentence = demandSentence('6-9', 'creative', 'thu_eve');
    expect(sentence).toContain('6-9 people');
    expect(sentence).toContain('creative activities');
    expect(sentence).toContain('thursday evenings');
    expect(sentence).toMatch(/^Estimated local interest:/);
  });

  it('phrases the open-ended bands as "or more"', () => {
    expect(demandSentence('10+', 'games', 'fri_eve')).toContain('10 or more people');
    expect(demandSentence('20+', 'games', 'fri_eve')).toContain('20 or more people');
  });

  it('produces a sentence for every band, category and slot combination', () => {
    for (const band of DEMAND_BANDS) {
      for (const category of EVENT_CATEGORY) {
        for (const slot of AVAILABILITY_SLOT) {
          const sentence = demandSentence(band, category, slot);
          expect(sentence).not.toMatch(/undefined/);
          expect(sentence.length).toBeGreaterThan(40);
        }
      }
    }
  });
});
