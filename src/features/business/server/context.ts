import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@/lib/api/errors';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { makeDeps, type BusinessDeps } from './deps';
import type { VenueContext } from './events';
import { toCapabilities } from './businesses';
import { createSupabaseStore } from './store-supabase';
import { makeLogAgentAction, makeNotify } from './stubs';

/**
 * Wires a request's Supabase client into the 05 dependency bundle. One call per route.
 */

type Sink = { insert: (rows: { user_id: string; type: string; payload: unknown }[]) => Promise<{ error: unknown }> };

/** Returns null when no service-role key is configured, which turns notify() into a no-op. */
const notificationSink = (table: string) => (): Sink | null => {
  try {
    const admin = supabaseAdmin();
    return {
      insert: async (rows) => {
        const { error } = await admin.from(table).insert(rows);
        return { error };
      },
    };
  } catch (err) {
    console.warn(`[ws05] no service-role client, skipping ${table} write`, err);
    return null;
  }
};

export function businessDeps(db: SupabaseClient): BusinessDeps {
  return makeDeps({
    store: createSupabaseStore(db, supabaseAdmin),
    notify: makeNotify(notificationSink('notifications')),
    logAgentAction: makeLogAgentAction(notificationSink('agent_action_log')),
  });
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
