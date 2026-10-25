import 'server-only';
import { ApiError } from '@/lib/api/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { boundingBox, type LatLng } from './geo';
import { MATCH_LIMITS } from './weights';

/**
 * Candidate prefilter for matching (spec §5 "Candidate set"): discoverable, adult-confirmed users
 * other than the viewer whose coarse location falls inside the viewer's travel-radius box.
 * Returns ids only; preferences come through the consent boundary, cards through `getPublicCards`.
 */
export async function loadCandidateIds(
  viewerId: string,
  center: LatLng,
  radiusKm: number,
  limit: number = MATCH_LIMITS.maxCandidates,
): Promise<string[]> {
  const box = boundingBox(center, radiusKm);
  const { data, error } = await createAdminClient()
    .from('profiles')
    .select('id')
    .eq('is_discoverable', true)
    .eq('is_adult_confirmed', true)
    .neq('id', viewerId)
    .gte('coarse_lat', box.minLat)
    .lte('coarse_lat', box.maxLat)
    .gte('coarse_lng', box.minLng)
    .lte('coarse_lng', box.maxLng)
    .order('id')
    .limit(limit);
  if (error) throw new ApiError('INTERNAL', 'Could not load match candidates', 500);
  return (data ?? []).map((row) => row.id);
}
