import { describe, expect, it } from 'vitest';
import { businessOnboardingSchema } from '@/features/business/schemas';
import {
  EMPTY_DRAFT,
  ONBOARDING_STEPS,
  canLeaveStep,
  dollarsToCents,
  toOnboardingBody,
  type OnboardingDraft,
} from '@/features/business/components/onboarding/draft';

const filled: OnboardingDraft = {
  ...EMPTY_DRAFT,
  name: '  Kiln & Cup  ',
  description: ' Pottery studio ',
  address: ' 1 Valencia St, Mission ',
  hours: { thu: [['09:00', '21:00']] },
  eventCategories: ['creative', 'food_drink'],
  capacity: 12,
  minPriceDollars: '15',
  maxPriceDollars: '35',
  hostingSlots: ['thu_eve', 'sat_day'],
  equipmentTags: ['pottery-wheels'],
  formats: ['workshop'],
  notes: ' Two staff ',
  acceptsAiProposals: true,
};

/** Spec section 7, Screen 1: the wizard must only ever submit a body the route accepts. */
describe('onboarding draft', () => {
  it('has the four steps from the spec', () => {
    expect(ONBOARDING_STEPS).toEqual(['Profile', 'Location & hours', 'What you can host', 'Review']);
  });

  it('turns dollars into cents and leaves an empty field unset', () => {
    expect(dollarsToCents('25')).toBe(2500);
    expect(dollarsToCents('12.5')).toBe(1250);
    expect(dollarsToCents('')).toBeUndefined();
    expect(dollarsToCents('   ')).toBeUndefined();
    expect(dollarsToCents('free')).toBeUndefined();
  });

  it('builds a body the route schema accepts', () => {
    const result = businessOnboardingSchema.safeParse(toOnboardingBody(filled));
    expect(result.success).toBe(true);
  });

  it('trims every text field it submits', () => {
    const body = toOnboardingBody(filled);
    expect(body.profile.name).toBe('Kiln & Cup');
    expect(body.profile.description).toBe('Pottery studio');
    expect(body.location.address).toBe('1 Valencia St, Mission');
    expect(body.capabilities.notes).toBe('Two staff');
  });

  it('sends undefined rather than an empty string for optional fields', () => {
    const body = toOnboardingBody({ ...filled, description: '  ', notes: '', neighborhood: '' });
    expect(body.profile.description).toBeUndefined();
    expect(body.capabilities.notes).toBeUndefined();
    expect(body.location.neighborhood).toBeUndefined();
    expect(body.profile.imageUrl).toBeNull();
  });

  it('gates each step on the fields that step owns', () => {
    expect(canLeaveStep(0, EMPTY_DRAFT)).toBe(false);
    expect(canLeaveStep(0, { ...EMPTY_DRAFT, name: 'Kiln & Cup' })).toBe(true);

    expect(canLeaveStep(1, EMPTY_DRAFT)).toBe(false);
    expect(canLeaveStep(1, { ...EMPTY_DRAFT, address: '1 Valencia St' })).toBe(true);

    expect(canLeaveStep(2, EMPTY_DRAFT)).toBe(false);
    expect(canLeaveStep(2, { ...EMPTY_DRAFT, hostingSlots: ['thu_eve'] })).toBe(true);
    expect(canLeaveStep(2, { ...EMPTY_DRAFT, eventCategories: [], hostingSlots: ['thu_eve'] })).toBe(false);

    expect(canLeaveStep(3, EMPTY_DRAFT)).toBe(true);
  });

  it('starts with the AI proposal toggle on, as the spec requires', () => {
    expect(EMPTY_DRAFT.acceptsAiProposals).toBe(true);
  });
});
