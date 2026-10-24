import 'server-only';
import { ApiError } from '@/lib/api/errors';
import type { EventCategory } from '@/shared/enums';
import type { BusinessCapabilities, BusinessOwnerView, BusinessPublicCard, WeeklyHours } from '@/shared/types';
import type { BusinessOnboardingInput, BusinessUpdateInput } from '../schemas';
import type { BusinessDeps } from './deps';
import { buildBusinessPublicCard } from './dto';
import { geocodeAddress, slugify } from './geocode';
import type { BusinessRow, CapabilitiesRow } from './store';

/** Onboarding, profile reads and the `getBusinessPublicCard` contract (spec sections 5 and 6). */

const MAX_SLUG_ATTEMPTS = 20;

export const toCapabilities = (row: CapabilitiesRow): BusinessCapabilities => ({
  eventCategories: row.event_categories as EventCategory[],
  capacity: row.capacity,
  minPriceCents: row.min_price_cents,
  maxPriceCents: row.max_price_cents,
  hostingSlots: row.hosting_slots as BusinessCapabilities['hostingSlots'],
  equipmentTags: row.equipment_tags,
  formats: row.formats,
  notes: row.notes,
  acceptsAiProposals: row.accepts_ai_proposals,
});

export const toOwnerView = (row: BusinessRow, capabilities: CapabilitiesRow): BusinessOwnerView => ({
  ...buildBusinessPublicCard(row),
  slug: row.slug,
  lat: row.lat,
  lng: row.lng,
  hours: row.hours,
  isActive: row.is_active,
  capabilities: toCapabilities(capabilities),
});

async function uniqueSlug(deps: BusinessDeps, name: string): Promise<string> {
  const base = slugify(name);
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    if (!(await deps.store.slugExists(candidate))) return candidate;
  }
  throw new ApiError('CONFLICT', `could not find a free slug for "${name}"`);
}

/** MVP: one business per owner (unique index `businesses_owner`). */
export async function createBusinessForOwner(
  deps: BusinessDeps,
  ownerId: string,
  input: BusinessOnboardingInput,
): Promise<BusinessOwnerView> {
  const existing = await deps.store.findBusinessByOwner(ownerId);
  if (existing) {
    throw new ApiError('CONFLICT', 'this account already owns a business');
  }

  const { profile, location, capabilities } = input;
  const geo = geocodeAddress(location.address, {
    neighborhood: location.neighborhood,
    lat: location.lat,
    lng: location.lng,
  });

  const row = await deps.store.createBusiness(
    {
      owner_id: ownerId,
      name: profile.name,
      slug: await uniqueSlug(deps, profile.name),
      description: profile.description ?? null,
      category: profile.category,
      address: location.address,
      neighborhood: geo.neighborhood,
      lat: geo.lat,
      lng: geo.lng,
      image_url: profile.imageUrl ?? null,
      hours: (location.hours ?? {}) as WeeklyHours,
      is_active: true,
    },
    {
      event_categories: capabilities.eventCategories,
      capacity: capabilities.capacity,
      min_price_cents: capabilities.minPriceCents ?? null,
      max_price_cents: capabilities.maxPriceCents ?? null,
      hosting_slots: capabilities.hostingSlots,
      equipment_tags: capabilities.equipmentTags,
      formats: capabilities.formats,
      notes: capabilities.notes ?? null,
      accepts_ai_proposals: capabilities.acceptsAiProposals,
    },
  );

  await deps.logAgentAction({
    userId: ownerId,
    action: 'business_onboarded',
    permissionsUsed: [],
    result: row.name,
  });

  return requireOwnerView(deps, row.id);
}

export async function requireOwnerView(deps: BusinessDeps, businessId: string): Promise<BusinessOwnerView> {
  const [row, capabilities] = await Promise.all([
    deps.store.findBusinessById(businessId),
    deps.store.findCapabilities(businessId),
  ]);
  if (!row || !capabilities) {
    throw new ApiError('NOT_FOUND', 'business does not exist');
  }
  return toOwnerView(row, capabilities);
}

export async function getOwnerBusiness(
  deps: BusinessDeps,
  ownerId: string,
): Promise<BusinessOwnerView | null> {
  const row = await deps.store.findBusinessByOwner(ownerId);
  if (!row) return null;
  return requireOwnerView(deps, row.id);
}

export async function updateOwnerBusiness(
  deps: BusinessDeps,
  businessId: string,
  input: BusinessUpdateInput,
): Promise<BusinessOwnerView> {
  const { profile, location, capabilities, isActive } = input;

  const geo =
    location?.address !== undefined || location?.lat !== undefined || location?.neighborhood !== undefined
      ? geocodeAddress(location.address ?? '', {
          neighborhood: location.neighborhood,
          lat: location.lat,
          lng: location.lng,
        })
      : null;

  const businessPatch = {
    ...(profile?.name !== undefined ? { name: profile.name } : {}),
    ...(profile?.description !== undefined ? { description: profile.description } : {}),
    ...(profile?.category !== undefined ? { category: profile.category } : {}),
    ...(profile?.imageUrl !== undefined ? { image_url: profile.imageUrl ?? null } : {}),
    ...(location?.address !== undefined ? { address: location.address } : {}),
    ...(location?.hours !== undefined ? { hours: location.hours as WeeklyHours } : {}),
    ...(geo ? { neighborhood: geo.neighborhood, lat: geo.lat, lng: geo.lng } : {}),
    ...(isActive !== undefined ? { is_active: isActive } : {}),
  };

  const capabilitiesPatch = {
    ...(capabilities?.eventCategories !== undefined ? { event_categories: capabilities.eventCategories } : {}),
    ...(capabilities?.capacity !== undefined ? { capacity: capabilities.capacity } : {}),
    ...(capabilities?.minPriceCents !== undefined ? { min_price_cents: capabilities.minPriceCents ?? null } : {}),
    ...(capabilities?.maxPriceCents !== undefined ? { max_price_cents: capabilities.maxPriceCents ?? null } : {}),
    ...(capabilities?.hostingSlots !== undefined ? { hosting_slots: capabilities.hostingSlots } : {}),
    ...(capabilities?.equipmentTags !== undefined ? { equipment_tags: capabilities.equipmentTags } : {}),
    ...(capabilities?.formats !== undefined ? { formats: capabilities.formats } : {}),
    ...(capabilities?.notes !== undefined ? { notes: capabilities.notes ?? null } : {}),
    ...(capabilities?.acceptsAiProposals !== undefined
      ? { accepts_ai_proposals: capabilities.acceptsAiProposals }
      : {}),
  };

  if (Object.keys(businessPatch).length > 0) {
    await deps.store.updateBusiness(businessId, businessPatch);
  }
  if (Object.keys(capabilitiesPatch).length > 0) {
    await deps.store.updateCapabilities(businessId, capabilitiesPatch);
  }

  return requireOwnerView(deps, businessId);
}

/**
 * `getBusinessPublicCard(businessId)` — the contract 04 and 06 consume. No owner id, no
 * capability notes, and an inactive business is treated as absent.
 */
export async function getBusinessPublicCardFor(
  deps: BusinessDeps,
  businessId: string,
): Promise<BusinessPublicCard> {
  const row = await deps.store.findBusinessById(businessId);
  if (!row || !row.is_active) {
    throw new ApiError('NOT_FOUND', 'business does not exist');
  }
  return buildBusinessPublicCard(row);
}
