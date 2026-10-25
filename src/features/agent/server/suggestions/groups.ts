import "server-only";
import type { SharablePreferences } from "@/shared/types";
import type { GroupCandidate } from "./types";

/**
 * `suggest_groups` from 03's public groups export. Groups the viewer already belongs to are
 * left out; the rest rank by interests shared with the viewer, then size.
 */
export type GroupsDeps = {
  publicGroups: (limit: number) => Promise<{ id: string; name: string; description: string | null; interests: string[]; memberCount: number }[]>;
  memberIds: (groupId: string) => Promise<string[]>;
};

const POOL = 12;

export async function suggestGroupsFrom(
  deps: GroupsDeps,
  viewer: Pick<SharablePreferences, "userId" | "interests">,
  limit = 3,
): Promise<GroupCandidate[]> {
  const groups = await deps.publicGroups(POOL);
  const ranked = groups
    .map((g) => ({ g, shared: g.interests.filter((i) => viewer.interests.includes(i)).length }))
    .sort((a, b) => b.shared - a.shared || b.g.memberCount - a.g.memberCount || a.g.name.localeCompare(b.g.name));
  const memberships = await Promise.all(ranked.map(({ g }) => deps.memberIds(g.id)));
  return ranked
    .filter((_, i) => !(memberships[i] ?? []).includes(viewer.userId))
    .slice(0, limit)
    .map(({ g }) => ({ id: g.id, name: g.name, description: g.description ?? "", memberCount: g.memberCount }));
}

/** Production wiring to 03's `@/features/groups` contract. */
export async function suggestGroups(viewer: Pick<SharablePreferences, "userId" | "interests">, limit = 3): Promise<GroupCandidate[]> {
  const { getPublicGroups, getGroupMemberIds } = await import("@/features/groups");
  return suggestGroupsFrom({ publicGroups: getPublicGroups, memberIds: getGroupMemberIds }, viewer, limit);
}
