import { beforeEach, describe, expect, it } from 'vitest';
import type { ApiError } from '@/lib/api/errors';
import {
  createBusinessForOwner,
  getBusinessPublicCardFor,
  getOwnerBusiness,
  updateOwnerBusiness,
} from '@/features/business/server/businesses';
import { CITY_CENTER, NEIGHBORHOODS, geocodeAddress, slugify } from '@/features/business/server/geocode';
import { NEIGHBORHOOD_LABELS } from '@/features/business/neighborhoods';
import { businessOnboardingSchema } from '@/features/business/schemas';
import { MemoryBusinessStore } from '../../support/memory-store';
import { testDeps, type TestDeps } from '../../support/fixtures';

const ONBOARDING = {
  profile: {
    name: 'Kiln & Cup',
    description: 'Pottery studio and coffee bar',
    category: 'creative' as const,
  },
  location: {
    address: '1 Valencia St, Mission, San Francisco',
    hours: { thu: [['09:00', '21:00']] as [string, string][] },
  },
  capabilities: {
    eventCategories: ['creative' as const, 'food_drink' as const],
    capacity: 12,
    minPriceCents: 1500,
    maxPriceCents: 3500,
    hostingSlots: ['thu_eve' as const, 'sat_day' as const],
    equipmentTags: ['pottery-wheels', 'kiln'],
    formats: ['workshop'],
    notes: 'Two staff on Thursdays',
    acceptsAiProposals: true,
  },
};

/** Shared by the suites below that assert on an ApiError code. */
const codeOfTop = async (fn: () => Promise<unknown>): Promise<string | undefined> => {
  try {
    await fn();
  } catch (err) {
    return (err as ApiError).code;
  }
  return undefined;
};

describe('static geocoding', () => {
  it('finds a neighborhood from the address', () => {
    const geo = geocodeAddress('1 Valencia St, San Francisco');
    expect(geo.neighborhood).toBe('Mission');
    expect(geo.matched).toBe(true);
  });

  it('matches on a neighborhood name as well as an alias', () => {
    expect(geocodeAddress('400 Hayes St').neighborhood).toBe('Hayes Valley');
    expect(geocodeAddress('somewhere in SoMa').neighborhood).toBe('SoMa');
  });

  it('falls back to the city centre with no label when nothing matches', () => {
    const geo = geocodeAddress('99 Nowhere Road, Elsewhere');
    expect(geo).toEqual({ neighborhood: '', lat: CITY_CENTER.lat, lng: CITY_CENTER.lng, matched: false });
  });

  it('lets an explicit lat/lng override the lookup', () => {
    const geo = geocodeAddress('1 Valencia St', { lat: 1.5, lng: -2.5 });
    expect(geo.lat).toBe(1.5);
    expect(geo.lng).toBe(-2.5);
    expect(geo.neighborhood).toBe('Mission');
  });

  it('lets an explicit neighborhood pick the coordinates', () => {
    const geo = geocodeAddress('99 Nowhere Road', { neighborhood: 'Castro' });
    expect(geo.neighborhood).toBe('Castro');
    expect(geo.lat).toBeCloseTo(37.7609, 4);
    expect(geo.matched).toBe(true);
  });

  it('offers the onboarding form exactly the labels it can geocode', () => {
    // neighborhoods.ts exists so the client form can list these without importing a
    // `server-only` module; this keeps the two from drifting apart.
    expect([...NEIGHBORHOOD_LABELS]).toEqual(NEIGHBORHOODS.map((n) => n.label));
  });

  it('slugifies a venue name', () => {
    expect(slugify('Kiln & Cup')).toBe('kiln-cup');
    expect(slugify('  Meeple House  ')).toBe('meeple-house');
    expect(slugify('Café Niña')).toBe('cafe-nina');
    expect(slugify('***')).toBe('venue');
  });
});

describe('onboarding payload', () => {
  it('accepts the demo form', () => {
    expect(businessOnboardingSchema.safeParse(ONBOARDING).success).toBe(true);
  });

  it('rejects a price range in the wrong order', () => {
    const result = businessOnboardingSchema.safeParse({
      ...ONBOARDING,
      capabilities: { ...ONBOARDING.capabilities, minPriceCents: 4000, maxPriceCents: 1000 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an opening window that closes before it opens', () => {
    const result = businessOnboardingSchema.safeParse({
      ...ONBOARDING,
      location: { ...ONBOARDING.location, hours: { thu: [['21:00', '09:00']] } },
    });
    expect(result.success).toBe(false);
  });

  it('requires at least one hosting slot and one category', () => {
    expect(
      businessOnboardingSchema.safeParse({
        ...ONBOARDING,
        capabilities: { ...ONBOARDING.capabilities, hostingSlots: [] },
      }).success,
    ).toBe(false);
    expect(
      businessOnboardingSchema.safeParse({
        ...ONBOARDING,
        capabilities: { ...ONBOARDING.capabilities, eventCategories: [] },
      }).success,
    ).toBe(false);
  });

  it('defaults the AI proposal toggle to on', () => {
    const parsed = businessOnboardingSchema.parse({
      ...ONBOARDING,
      capabilities: {
        eventCategories: ['creative'],
        capacity: 12,
        hostingSlots: ['thu_eve'],
      },
    });
    expect(parsed.capabilities.acceptsAiProposals).toBe(true);
  });
});

describe('business onboarding', () => {
  let store: MemoryBusinessStore;
  let deps: TestDeps;

  beforeEach(() => {
    store = new MemoryBusinessStore();
    deps = testDeps(store);
  });

  const codeOf = async (fn: () => Promise<unknown>): Promise<string | undefined> => {
    try {
      await fn();
    } catch (err) {
      return (err as ApiError).code;
    }
    return undefined;
  };

  it('creates the business, its capabilities and a geocoded location', async () => {
    const view = await createBusinessForOwner(deps, 'owner-1', businessOnboardingSchema.parse(ONBOARDING));

    expect(view.name).toBe('Kiln & Cup');
    expect(view.slug).toBe('kiln-cup');
    expect(view.neighborhood).toBe('Mission');
    expect(view.capabilities.capacity).toBe(12);
    expect(view.capabilities.acceptsAiProposals).toBe(true);
    expect(view.isActive).toBe(true);
  });

  it('logs the onboarding as an agent action', async () => {
    await createBusinessForOwner(deps, 'owner-1', businessOnboardingSchema.parse(ONBOARDING));
    expect(deps.actions.map((a) => a.action)).toEqual(['business_onboarded']);
  });

  it('gives a second venue with the same name a distinct slug', async () => {
    await createBusinessForOwner(deps, 'owner-1', businessOnboardingSchema.parse(ONBOARDING));
    const second = await createBusinessForOwner(deps, 'owner-2', businessOnboardingSchema.parse(ONBOARDING));
    expect(second.slug).toBe('kiln-cup-2');
  });

  it('allows only one business per owner', async () => {
    await createBusinessForOwner(deps, 'owner-1', businessOnboardingSchema.parse(ONBOARDING));
    expect(
      await codeOf(() => createBusinessForOwner(deps, 'owner-1', businessOnboardingSchema.parse(ONBOARDING))),
    ).toBe('CONFLICT');
  });

  it('returns null for an account with no business', async () => {
    expect(await getOwnerBusiness(deps, 'owner-nobody')).toBeNull();
  });

  it('updates only the sections that were sent', async () => {
    const created = await createBusinessForOwner(deps, 'owner-1', businessOnboardingSchema.parse(ONBOARDING));
    const updated = await updateOwnerBusiness(deps, created.id, {
      capabilities: { capacity: 20, acceptsAiProposals: false },
    });

    expect(updated.capabilities.capacity).toBe(20);
    expect(updated.capabilities.acceptsAiProposals).toBe(false);
    expect(updated.name).toBe('Kiln & Cup');
    expect(updated.neighborhood).toBe('Mission');
  });

  it('re-geocodes when the address changes', async () => {
    const created = await createBusinessForOwner(deps, 'owner-1', businessOnboardingSchema.parse(ONBOARDING));
    const updated = await updateOwnerBusiness(deps, created.id, {
      location: { address: '400 Hayes St, San Francisco' },
    });
    expect(updated.neighborhood).toBe('Hayes Valley');
    expect(updated.address).toBe('400 Hayes St, San Francisco');
  });

  it('can deactivate the business', async () => {
    const created = await createBusinessForOwner(deps, 'owner-1', businessOnboardingSchema.parse(ONBOARDING));
    const updated = await updateOwnerBusiness(deps, created.id, { isActive: false });
    expect(updated.isActive).toBe(false);
  });

  it('exposes a public card with no owner id and no capability notes', async () => {
    const created = await createBusinessForOwner(deps, 'owner-1', businessOnboardingSchema.parse(ONBOARDING));
    const card = await getBusinessPublicCardFor(deps, created.id);
    expect(JSON.stringify(card)).not.toContain('owner-1');
    expect(JSON.stringify(card)).not.toContain('Two staff on Thursdays');
  });

  it('refuses to build an owner view when the capabilities row is missing', async () => {
    // Only reachable if the capabilities insert was lost; the store deletes the business
    // again when that happens, so a half-created venue must not render as a real one.
    const bare = new MemoryBusinessStore();
    const bareDeps = testDeps(bare);
    bare.seedBusiness({ owner_id: 'owner-1' });
    // @ts-expect-error reaching past the port on purpose to simulate the inconsistency
    bare.capabilities = [];
    expect(await codeOf(() => getOwnerBusiness(bareDeps, 'owner-1'))).toBe('NOT_FOUND');
  });

  it('treats a deactivated business as absent for the public card', async () => {
    const created = await createBusinessForOwner(deps, 'owner-1', businessOnboardingSchema.parse(ONBOARDING));
    await updateOwnerBusiness(deps, created.id, { isActive: false });
    expect(await codeOf(() => getBusinessPublicCardFor(deps, created.id))).toBe('NOT_FOUND');
  });
});

describe('venue context', () => {
  it('refuses to validate an event against a venue that is not fully set up', async () => {
    const { requireVenueContext } = await import('@/features/business/server/context');
    const bare = new MemoryBusinessStore();
    const bareDeps = testDeps(bare);

    // No business at all.
    expect(await codeOfTop(() => requireVenueContext(bareDeps, 'biz-missing'))).toBe('NOT_FOUND');

    // A business whose capabilities row never landed.
    const seeded = bare.seedBusiness({ owner_id: 'owner-1' });
    // @ts-expect-error reaching past the port on purpose to simulate the inconsistency
    bare.capabilities = [];
    expect(await codeOfTop(() => requireVenueContext(bareDeps, seeded.business.id))).toBe('NOT_FOUND');
  });

  it('returns the capabilities and hours an event is checked against', async () => {
    const { requireVenueContext } = await import('@/features/business/server/context');
    const store = new MemoryBusinessStore();
    const deps = testDeps(store);
    const seeded = store.seedBusiness({ owner_id: 'owner-1' });

    const venue = await requireVenueContext(deps, seeded.business.id);
    expect(venue.capabilities.capacity).toBe(12);
    expect(venue.hours.thu).toEqual([['09:00', '21:00']]);
  });
});
