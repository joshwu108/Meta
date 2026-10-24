import { getActivity } from "@/features/events/server/activity";
import { ok, withAuth } from "@/features/events/server/stubs";

export const GET = withAuth(async ({ user }) => ok(await getActivity(user.id)));
