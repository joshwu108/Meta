# Merging ws/01-core into ws/06-events

Rehearsed twice on 2026-10-24 in throwaway worktrees; latest against ws/01-core `663b7ed` from ws/06-events `505752b`. After the steps below: typecheck 0 errors, lint 0 errors (2 `<img>` warnings), 176 unit + 61 db tests green, `next build` compiles. Whoever merges (06's worker on its next sync, or the integrator) can follow it as written.

## 1. Conflicts (12 files)

| File | Take |
|---|---|
| `.gitignore`, `next.config.ts`, `package.json`, `pnpm-lock.yaml`, `playwright.config.ts`, `tsconfig.json`, `vitest.config.ts`, `src/app/layout.tsx`, `src/styles/tokens.css` | 01's (`git checkout --theirs`) |
| `src/app/(consumer)/activity/page.tsx`, `discover/page.tsx`, `events/page.tsx` | 06's (`git checkout --ours`); 01's are placeholders for 06's screens |

Then delete 06's interim `eslint.config.js` (01 ships `eslint.config.mjs`).

## 2. Additions to 01's files

- `src/shared/*` merge cleanly: 06's interim copies already match 01's `663b7ed`.
- `package.json`: devDependencies `pg` and `@types/pg` (`8.23.1`); then `pnpm install` (01 pins pnpm 10).
- `vitest.config.ts`: nothing to add. 01's `db` project (`39435da`) already includes `tests/db/**` with 06's `setupFiles` and `globalSetup`. Without Supabase running, point it at any local Postgres: `TEST_DATABASE_URL=postgres://localhost:5432/postgres pnpm test:db`.
- `supabase/seed/loaders/registry.ts`: import `loadRsvps` from `./rsvps` and set
  `AFTER_EVENTS = [{ name: 'rsvps', run: (ctx) => loadRsvps(ctx) }]`. Typechecks against 01's `SeedContext`; running the seed needs a Supabase stack.

## 3. Swap 06's stand-ins for 01's modules

`src/features/events/server/stubs/clients.ts`:

```ts
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
```

`src/features/events/server/stubs/core.ts` (keep `listNotifications` as is):

```ts
import "server-only";
import { ApiError } from "@/lib/api";
import { getCurrentUser } from "@/features/core";
import { createAdminClient } from "./clients";

// 01's API helpers, clients and core contracts, re-exported so 06's modules keep one import path.

export { ApiError, fail, ok, parseBody, toErrorResponse, withAuth, type AuthCtx, type ErrorCode } from "@/lib/api";
export { logAgentAction, notify } from "@/features/core";
export { createAdminClient, createUserClient } from "./clients";

// ... listNotifications unchanged ...

/** Signed-in user id for server components; null when there is no session. */
export async function getCurrentUserId(): Promise<string | null> {
  return (await getCurrentUser())?.id ?? null;
}
```

`tests/db/support/setup.ts`:

```ts
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
```

## 4. Follow-ups (not needed for green, do next)

- Swap `src/features/events/components/ui` for `@/features/core/components/ui` (props already match; keep `buttonClass` or style links with 01's classes) and `components/api.ts` for `@/lib/api/client`.
- Discover: 01's consumer layout already renders a right-rail `AgentAside`; drop Discover's own rail or move the agent strip into it.
- Replace `stubs/social.ts` with `@/features/matching` + `@/features/groups` and `stubs/agent.ts` with `@/features/agent` when 03 and 02 merge (signatures identical; 03 exports `getPendingConnectionRequests(userId)` for Activity).
