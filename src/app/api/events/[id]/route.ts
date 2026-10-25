import { getEventDetail } from "@/features/events/server/detail";
import { eventRoute } from "@/features/events/server/http";
import { ok } from "@/features/events/server/stubs";

export const GET = eventRoute(async ({ user }, eventId) => ok(await getEventDetail(user.id, eventId)));
