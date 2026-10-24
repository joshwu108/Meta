import 'server-only';
import type { AvailabilitySlot, EventCategory } from '@/shared/enums';
import { AVAILABILITY_SLOT, EVENT_CATEGORY } from '@/shared/enums';
import type { BusinessInsights } from '@/shared/types';
import { ApiError } from '@/lib/api/errors';
import type { BusinessDeps } from './deps';
import { buildInsights } from './dto';

/**
 * P1 `/business/insights` (spec section 3): banded community interest by category x slot
 * within `INSIGHTS_RADIUS_KM` over the last `INSIGHTS_WINDOW_DAYS`. Banded only — a raw
 * cohort count never reaches a business.
 */

export const INSIGHTS_RADIUS_KM = 3;
export const INSIGHTS_WINDOW_DAYS = 30;

const isCategory = (value: string): value is EventCategory =>
  (EVENT_CATEGORY as readonly string[]).includes(value);
const isSlot = (value: string): value is AvailabilitySlot =>
  (AVAILABILITY_SLOT as readonly string[]).includes(value);

export async function getBusinessInsights(
  deps: BusinessDeps,
  businessId: string,
): Promise<BusinessInsights> {
  const business = await deps.store.findBusinessById(businessId);
  if (!business) throw new ApiError('NOT_FOUND', 'business does not exist');

  const rows = await deps.store.insightClusters({
    lat: business.lat,
    lng: business.lng,
    radiusKm: INSIGHTS_RADIUS_KM,
    sinceDays: INSIGHTS_WINDOW_DAYS,
  });

  const clusters = rows.flatMap((row) =>
    isCategory(row.category) && isSlot(row.slot)
      ? [{ category: row.category, slot: row.slot, memberCount: row.member_count }]
      : [],
  );

  return buildInsights({
    withinKm: INSIGHTS_RADIUS_KM,
    sinceDays: INSIGHTS_WINDOW_DAYS,
    clusters,
  });
}
