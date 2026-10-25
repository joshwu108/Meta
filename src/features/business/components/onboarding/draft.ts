import type { AvailabilitySlot, EventCategory } from '@/shared/enums';
import type { WeeklyHours } from '@/shared/types';

/** The whole onboarding form as one immutable value (spec section 7, Screen 1). */
export type OnboardingDraft = {
  name: string;
  description: string;
  category: EventCategory;
  imageUrl: string;
  address: string;
  neighborhood: string;
  hours: WeeklyHours;
  eventCategories: EventCategory[];
  capacity: number;
  minPriceDollars: string;
  maxPriceDollars: string;
  hostingSlots: AvailabilitySlot[];
  equipmentTags: string[];
  formats: string[];
  notes: string;
  acceptsAiProposals: boolean;
};

export const EMPTY_DRAFT: OnboardingDraft = {
  name: '',
  description: '',
  category: 'creative',
  imageUrl: '',
  address: '',
  neighborhood: '',
  hours: {},
  eventCategories: ['creative'],
  capacity: 12,
  minPriceDollars: '',
  maxPriceDollars: '',
  hostingSlots: [],
  equipmentTags: [],
  formats: [],
  notes: '',
  acceptsAiProposals: true,
};

export const ONBOARDING_STEPS = ['Profile', 'Location & hours', 'What you can host', 'Review'] as const;

export type StepProps = {
  draft: OnboardingDraft;
  set: <K extends keyof OnboardingDraft>(key: K, value: OnboardingDraft[K]) => void;
  errors: Record<string, string>;
};

export const dollarsToCents = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : undefined;
};

/** The request body `POST /api/business` expects. */
export const toOnboardingBody = (draft: OnboardingDraft) => ({
  profile: {
    name: draft.name.trim(),
    description: draft.description.trim() || undefined,
    category: draft.category,
    imageUrl: draft.imageUrl.trim() || null,
  },
  location: {
    address: draft.address.trim(),
    neighborhood: draft.neighborhood || undefined,
    hours: draft.hours,
  },
  capabilities: {
    eventCategories: draft.eventCategories,
    capacity: draft.capacity,
    minPriceCents: dollarsToCents(draft.minPriceDollars),
    maxPriceCents: dollarsToCents(draft.maxPriceDollars),
    hostingSlots: draft.hostingSlots,
    equipmentTags: draft.equipmentTags,
    formats: draft.formats,
    notes: draft.notes.trim() || undefined,
    acceptsAiProposals: draft.acceptsAiProposals,
  },
});

/** Each step gates Continue on the fields it owns. */
export const canLeaveStep = (step: number, draft: OnboardingDraft): boolean => {
  if (step === 0) return draft.name.trim().length >= 2;
  if (step === 1) return draft.address.trim().length >= 4;
  if (step === 2) return draft.eventCategories.length > 0 && draft.hostingSlots.length > 0;
  return true;
};
