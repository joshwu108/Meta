import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@/lib/api';
import { createAdminClient } from '@/lib/supabase/admin';
import { makeDeps, type BusinessDeps } from './deps';
import type { VenueContext } from './events';
import { toCapabilities } from './businesses';
import { createSupabaseStore } from './store-supabase';

/** Wires a request's Supabase client into the 05 dependency bundle. One call per route. */
export function businessDeps(db: SupabaseClient): BusinessDeps {
  return makeDeps({ store: createSupabaseStore(db, createAdminClient) });
}

/** The capabilities and hours every event write is validated against. */
export async function requireVenueContext(
  deps: BusinessDeps,
  businessId: string,
): Promise<VenueContext> {
  const [business, capabilities] = await Promise.all([
    deps.store.findBusinessById(businessId),
    deps.store.findCapabilities(businessId),
  ]);
  if (!business || !capabilities) {
    throw new ApiError('NOT_FOUND', 'this account does not own a business yet');
  }
  return { capabilities: toCapabilities(capabilities), hours: business.hours };
}
