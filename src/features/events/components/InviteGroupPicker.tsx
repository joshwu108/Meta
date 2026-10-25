"use client";

import { useEffect, useState, useTransition } from "react";
import { apiGet, apiPost } from "@/lib/api/client";
import { Button } from "@/features/core/components/ui";
import { invitableGroups, type MyGroup } from "./invite-groups";
import s from "./events.module.css";

type Group = { id: string; name: string };
type InviteResult = { invited: number; skipped: { rsvped: number; blocked: number; alreadyInvited: number } };

function inviteMessage({ invited, skipped }: InviteResult): string {
  if (invited > 0) return `Invited ${invited} ${invited === 1 ? "member" : "members"}. They'll each choose whether to RSVP.`;
  // Blocked members are never named or counted separately, so a block is not revealed.
  return skipped.rsvped + skipped.alreadyInvited > 0
    ? "Everyone else in that group is already invited or going."
    : "There's no one else in that group to invite yet.";
}

/** Sends invitations to a group; members still RSVP individually. Groups come from 03's GET /api/groups. */
export function InviteGroupPicker({ eventId }: { eventId: string }) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [groupId, setGroupId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    apiGet<MyGroup[]>("/api/groups")
      .then((list) => setGroups(invitableGroups(list)))
      .catch(() => setGroups([]));
  }, []);

  if (groups === null) return <p className={s.meta}>Loading your groups…</p>;
  if (groups.length === 0) return <p className={s.meta}>Join or create a group to invite it here.</p>;

  const invite = () =>
    startTransition(async () => {
      try {
        const result = await apiPost<InviteResult>(`/api/events/${eventId}/invite-group`, { groupId });
        setMessage(inviteMessage(result));
      } catch (err) {
        setMessage((err as Error).message);
      }
    });

  return (
    <div className={s.field}>
      <label htmlFor="invite-group" className={s.meta}>Invite a group</label>
      <div className={s.row}>
        <select id="invite-group" className={s.select} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          <option value="">Choose a group</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <Button variant="secondary" disabled={!groupId || pending} onClick={invite}>Invite</Button>
      </div>
      {message ? <p className={s.meta} role="status">{message}</p> : null}
    </div>
  );
}
