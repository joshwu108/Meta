import { eventRoute } from "@/features/events/server/http";
import { completeEvent } from "@/features/events/server/post-event";
import { ok } from "@/features/events/server/stubs";

export const PATCH = eventRoute(async ({ user }, eventId) => ok(await completeEvent(user.id, eventId)));
