import { AVAILABILITY_SLOT, EVENT_CATEGORY, GROUP_SIZE_PREF, SOCIAL_GOAL } from '../../../src/shared/enums';
import type { AvailabilitySlot, EventCategory } from '../../../src/shared/enums';
import { SEED_DOMAIN } from '../types';
import { CATEGORY_TAGS, NEIGHBORHOODS, cohortPlans, type CohortPlan } from './cohorts';
import { chance, intBetween, jitterLatLng, makeRng, pick, pickSome, shuffle, type Rng } from './rng';

/**
 * Turns planted cohorts into profile, preference and agent-profile rows. Everything derives from
 * one fixed seed, so a reseed produces identical people.
 *
 * Emails are namespaced under `gen.` so they can never collide with the hand-written demo
 * fixtures that the e2e suites assert on, while still sitting under the seed domain that
 * `deleteSeedUsers` cleans up.
 */

const SEED = 20261025;

/** Members are scattered this far from the cohort centre: well inside one 0.02-degree geocell. */
const COHORT_JITTER_KM = 0.6;

/** Large enough that every member reaches the cohort centroid, so `withinEveryRadius` holds. */
const TRAVEL_RADIUS_KM = { min: 5, max: 15 } as const;

/** A minority opts out of demand aggregation so the consent boundary stays exercised. */
const DEMAND_OPT_OUT_RATE = 0.1;

const FIRST = [
  'Ana', 'Beatriz', 'Cai', 'Dara', 'Eli', 'Farrah', 'Gus', 'Hana', 'Ira', 'Jae', 'Kira', 'Liam',
  'Mina', 'Noor', 'Omar', 'Pia', 'Quinn', 'Rafa', 'Sana', 'Tariq', 'Uma', 'Vik', 'Wren', 'Xiomara',
  'Yuki', 'Zane', 'Alma', 'Bodhi', 'Cleo', 'Dmitri', 'Esme', 'Finn', 'Greta', 'Hugo', 'Isla', 'Juno',
];
const LAST = [
  'Alvarez', 'Benali', 'Chen', 'Duarte', 'Eriksen', 'Fontaine', 'Gupta', 'Haddad', 'Ibrahim',
  'Jansen', 'Kowalski', 'Lindqvist', 'Moreau', 'Nakamura', 'Okafor', 'Petrova', 'Quintero',
  'Rossi', 'Silva', 'Takahashi', 'Ueda', 'Vargas', 'Walsh', 'Xu', 'Yoon', 'Zhang',
];

const ACTIVITY_PREFS = ['quiet', 'lively', 'outdoors', 'hands-on', 'structured', 'casual', 'beginner-friendly'];

/** Bio prose from a phrase bank. Muse-written bios land with workstream B, when bio text starts feeding embeddings. */
const BIO_OPENERS = [
  'Recently moved to the neighbourhood and looking for people to do things with.',
  'Here for small groups and low-key plans.',
  'Happiest with a project in my hands and someone to talk to.',
  'Trying to get out of the house more on weeknights.',
  'Long-time resident, always up for meeting neighbours.',
  'New to the city and saying yes to most things.',
];

export type GeneratedPerson = {
  email: string;
  displayName: string;
  neighborhood: string;
  coarseLat: number;
  coarseLng: number;
  isDiscoverable: boolean;
  bio: string;
  interests: string[];
  interestCategories: EventCategory[];
  availabilitySlots: AvailabilitySlot[];
  socialGoals: string[];
  groupSizePref: string;
  budgetMinCents: number;
  budgetMaxCents: number;
  travelRadiusKm: number;
  activityPrefs: string[];
  summary: string;
  consent: {
    allow_matching: boolean;
    allow_demand_aggregation: boolean;
    allow_group_planning: boolean;
    share_interests_with_attendees: boolean;
    share_name_with_business: boolean;
  };
  /** Cohort this person was planted for, or null for unaffiliated noise. */
  cohortKey: string | null;
};

function nameFor(rng: Rng, index: number): string {
  const first = FIRST[index % FIRST.length] as string;
  const last = pick(rng, LAST) as string;
  return `${first} ${last}`;
}

function personFrom(
  rng: Rng,
  index: number,
  place: { name: string; lat: number; lng: number },
  jitterKm: number,
  category: EventCategory,
  slot: AvailabilitySlot,
  coreTags: readonly string[],
  cohortKey: string | null,
): GeneratedPerson {
  const displayName = nameFor(rng, index);
  const { lat, lng } = jitterLatLng(rng, place.lat, place.lng, jitterKm);

  // Core tags are shared by the whole cohort so the cluster's top interests clear the minimum
  // tag count; the extras give each person a distinct profile.
  const pool = CATEGORY_TAGS[category].filter((tag) => !coreTags.includes(tag));
  const interests = [...coreTags, ...pickSome(rng, pool, intBetween(rng, 1, 2))];

  // A second category for some people, so matching has cross-category signal to work with.
  const secondary = chance(rng, 0.35) ? pick(rng, EVENT_CATEGORY.filter((c) => c !== category)) : undefined;
  const interestCategories = secondary ? [category, secondary] : [category];
  if (secondary) interests.push(...pickSome(rng, CATEGORY_TAGS[secondary], 1));

  // The cohort slot is always present; extra slots make availability realistic without
  // splitting the planted cluster.
  const otherSlots = AVAILABILITY_SLOT.filter((s) => s !== slot);
  const availabilitySlots = [slot, ...pickSome(rng, otherSlots, intBetween(rng, 0, 2))];

  const budgetMinCents = intBetween(rng, 0, 3) * 500;
  const allowDemand = !chance(rng, DEMAND_OPT_OUT_RATE);

  return {
    email: `gen.${(cohortKey ?? 'solo').replace(/[^a-z0-9-]/gi, '')}.${index}@${SEED_DOMAIN}`,
    displayName,
    neighborhood: place.name,
    coarseLat: lat,
    coarseLng: lng,
    isDiscoverable: true,
    bio: `${pick(rng, BIO_OPENERS)} Into ${interests.slice(0, 2).join(' and ')}.`,
    interests: [...new Set(interests)],
    interestCategories,
    availabilitySlots: [...new Set(availabilitySlots)] as AvailabilitySlot[],
    socialGoals: pickSome(rng, SOCIAL_GOAL, intBetween(rng, 1, 2)),
    groupSizePref: pick(rng, GROUP_SIZE_PREF) as string,
    budgetMinCents,
    budgetMaxCents: budgetMinCents + intBetween(rng, 3, 10) * 500,
    travelRadiusKm: intBetween(rng, TRAVEL_RADIUS_KM.min, TRAVEL_RADIUS_KM.max),
    activityPrefs: pickSome(rng, ACTIVITY_PREFS, intBetween(rng, 1, 3)),
    summary: `${displayName} lives in ${place.name} and is interested in ${interests.slice(0, 3).join(', ')}.`,
    consent: {
      allow_matching: true,
      allow_demand_aggregation: allowDemand,
      allow_group_planning: true,
      share_interests_with_attendees: true,
      share_name_with_business: chance(rng, 0.5),
    },
    cohortKey,
  };
}

/**
 * `total` people: every planted cohort first (so clusters are guaranteed), then unaffiliated
 * people spread over the neighbourhoods as realistic noise.
 */
export function generatePeople(total: number, plans: readonly CohortPlan[] = cohortPlans()): GeneratedPerson[] {
  const rng = makeRng(SEED);
  const people: GeneratedPerson[] = [];

  for (const plan of plans) {
    for (let i = 0; i < plan.size && people.length < total; i += 1) {
      people.push(
        personFrom(
          rng,
          people.length,
          { name: plan.neighborhood, lat: plan.lat, lng: plan.lng },
          COHORT_JITTER_KM,
          plan.category,
          plan.slot,
          plan.coreTags,
          plan.key,
        ),
      );
    }
  }

  // Noise: random category, slot and neighbourhood, scattered widely enough that they do not
  // accidentally form or break a cluster.
  const categories = shuffle(rng, EVENT_CATEGORY);
  while (people.length < total) {
    const place = pick(rng, NEIGHBORHOODS) as { name: string; lat: number; lng: number };
    const category = categories[people.length % categories.length] as EventCategory;
    const slot = pick(rng, AVAILABILITY_SLOT) as AvailabilitySlot;
    people.push(
      personFrom(rng, people.length, place, 2.5, category, slot, pickSome(rng, CATEGORY_TAGS[category], 2), null),
    );
  }

  return people;
}
