import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient as createTypedAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";

// 01's clients, widened to the untyped client until `pnpm db:types` includes 06's tables.

export async function createUserClient(): Promise<SupabaseClient> {
  return (await createServerClient()) as unknown as SupabaseClient;
}

export function createAdminClient(): SupabaseClient {
  return createTypedAdminClient() as unknown as SupabaseClient;
}
