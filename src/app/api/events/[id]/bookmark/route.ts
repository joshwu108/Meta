import { setEventBookmark } from "@/features/events/server/bookmarks";
import { eventRoute } from "@/features/events/server/http";
import { ok } from "@/features/events/server/stubs";

export const POST = eventRoute(async ({ user, supabase }, eventId) => ok(await setEventBookmark(supabase, user.id, eventId, true)));

export const DELETE = eventRoute(async ({ user, supabase }, eventId) => ok(await setEventBookmark(supabase, user.id, eventId, false)));
