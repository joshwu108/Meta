import { getAttendeeList } from "@/features/events/server/attendees";
import { eventRoute } from "@/features/events/server/http";
import { ok } from "@/features/events/server/stubs";

export const GET = eventRoute(async ({ user }, eventId) => ok(await getAttendeeList(user.id, eventId)));
