/** A row of 03's `GET /api/groups` (GroupSummary), reduced to what the picker reads. */
export type MyGroup = { id: string; name: string; myStatus: string | null };

/**
 * Groups the viewer may invite to an event. 03 lists groups where the viewer is active or only
 * invited, but invite-group requires an active membership, so invited-only groups are left out.
 */
export function invitableGroups(groups: readonly MyGroup[]): Array<{ id: string; name: string }> {
  return groups.filter((g) => g.myStatus === "active").map((g) => ({ id: g.id, name: g.name }));
}
