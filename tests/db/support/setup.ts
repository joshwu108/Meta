import { vi } from "vitest";

// Every Supabase client the app obtains (06's code, 01's withAuth, notify, logAgentAction) is a
// fake bound to the current test database.

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/admin", async () => {
  const { fakeSupabase } = await import("./fake-supabase");
  const { currentPool } = await import("./state");
  return { createAdminClient: () => fakeSupabase(currentPool()) };
});

vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabase } = await import("./fake-supabase");
  const { clientState, currentPool } = await import("./state");
  return { createServerClient: async () => fakeSupabase(currentPool(), clientState.userId) };
});
