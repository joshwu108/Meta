import { FollowUpActionBody, FollowUpIdParams } from "@/features/events/schemas";
import { respondToFollowUp } from "@/features/events/server/follow-ups";
import { ok, parseBody, withAuth } from "@/features/events/server/stubs";

export const PATCH = withAuth(async ({ user }, req, params) => {
  const { id } = FollowUpIdParams.parse(params);
  const { action } = await parseBody(FollowUpActionBody, req);
  return ok(await respondToFollowUp(user.id, id, action));
});
