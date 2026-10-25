import { redirect } from "next/navigation";
import {
  FollowUpsSection,
  InvitationsSection,
  NotificationsSection,
  PastSection,
  RequestsSection,
  SavedSection,
  UpcomingSection,
} from "@/features/events/components/ActivitySections";
import s from "@/features/events/components/events.module.css";
import { getActivity } from "@/features/events/server/activity";
import { getCurrentUserId } from "@/features/events/server/stubs";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login");
  const activity = await getActivity(userId);

  return (
    <div className={s.column}>
      <h1 className={s.pageTitle}>My Activity</h1>
      <UpcomingSection events={activity.upcoming} />
      <SavedSection events={activity.saved} />
      <InvitationsSection invitations={activity.invitations} />
      <RequestsSection requests={activity.connectionRequests} />
      <PastSection events={activity.past} />
      <FollowUpsSection followUps={activity.followUps} />
      <NotificationsSection notifications={activity.notifications} />
    </div>
  );
}
