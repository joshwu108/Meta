import { AgentLogQuerySchema } from "@/features/agent/schemas";
import { listAgentLog } from "@/features/agent/server/repo";
import { ok, withAuth } from "@/features/agent/server/stubs";

export const GET = withAuth(async ({ user, supabase }, req) => {
  const { limit } = AgentLogQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return ok(await listAgentLog(supabase, user.id, limit), { limit });
});
