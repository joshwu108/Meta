import { vi } from "vitest";

// Every Supabase client 06's code obtains is a fake bound to the current test database.
// Before ws/01-core merges, 06's own stand-ins create the clients; after the merge this file
// mocks 01's `@/lib/supabase/admin` and `@/lib/supabase/server` instead (see PROGRESS.md).

vi.mock("server-only", () => ({}));

vi.mock("@/features/events/server/stubs/clients", async () => {
  const { fakeSupabase } = await import("./fake-supabase");
  const { clientState, currentPool } = await import("./state");
  return {
    createAdminClient: () => fakeSupabase(currentPool()),
    createUserClient: async () => fakeSupabase(currentPool(), clientState.userId),
  };
});
