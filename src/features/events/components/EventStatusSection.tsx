import type { EventDetail } from "../server/detail";
import type { AttendeeView } from "../server/visibility";
import { CompleteEventButton } from "./CompleteEventButton";
import { FeedbackForm } from "./FeedbackForm";
import { InviteGroupPicker } from "./InviteGroupPicker";
import { ReconfirmBanner } from "./ReconfirmBanner";
import { ReconnectList } from "./ReconnectList";
import { RsvpPanel } from "./RsvpPanel";
import s from "./events.module.css";

type Props = { event: EventDetail; attendees: AttendeeView[] | null; feedbackGiven: boolean };

/** Status-aware actions: RSVP while live, a notice when cancelled, feedback and reconnect once completed. */
export function EventStatusSection({ event, attendees, feedbackGiven }: Props) {
  if (event.status === "cancelled") {
    return <div className={s.banner} role="status"><strong>This event was cancelled by the venue.</strong></div>;
  }
  if (event.status === "completed") {
    if (event.rsvpStatus !== "confirmed") return <p className={s.meta}>This event has ended.</p>;
    return (
      <>
        <section className={s.section} aria-labelledby="feedback-title">
          <h2 id="feedback-title" className={s.sectionTitle}>How did it go?</h2>
          <FeedbackForm eventId={event.id} alreadyGiven={feedbackGiven} />
        </section>
        <section className={s.section} aria-labelledby="reconnect-title">
          <h2 id="reconnect-title" className={s.sectionTitle}>Who would you like to see again?</h2>
          <ReconnectList eventId={event.id} attendees={attendees ?? []} />
        </section>
      </>
    );
  }
  return (
    <>
      {event.needsReconfirm ? <ReconfirmBanner eventId={event.id} startsAt={event.startsAt} /> : null}
      <RsvpPanel eventId={event.id} status={event.status} rsvpStatus={event.rsvpStatus} defaults={event.consentDefaults} waitlistEnabled={event.waitlistEnabled} />
      <InviteGroupPicker eventId={event.id} />
      {event.canComplete ? <CompleteEventButton eventId={event.id} /> : null}
    </>
  );
}
