import { InviteGroupBody } from "@/features/events/schemas";
import { eventRoute } from "@/features/events/server/http";
import { inviteGroupToEvent } from "@/features/events/server/invite-group";
import { ok, parseBody } from "@/features/events/server/stubs";

export const POST = eventRoute(async ({ user }, eventId, req) => {
  const { groupId } = await parseBody(InviteGroupBody, req);
  return ok(await inviteGroupToEvent(user.id, eventId, groupId));
});
