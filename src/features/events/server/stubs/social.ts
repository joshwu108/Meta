import "server-only";
import { z } from "zod";
import type { BlockEdge } from "../visibility";
import { createAdminClient } from "./core";

const uuid = (id: string) => z.string().uuid().parse(id);

// Stand-ins for 03's data (specs/03-matching-and-groups/specs.md). Only `getGroupMemberIds`
// is a published contract; the rest are requested in PROGRESS.md "Needs from others".

/** 03 contract: ids of the group's active members. */
export async function getGroupMemberIds(groupId: string): Promise<string[]> {
  const { data, error } = await createAdminClient()
    .from("group_members").select("user_id").eq("group_id", groupId).eq("status", "active");
  if (error) throw error;
  return (data ?? []).map((r) => r.user_id as string);
}

/** Accepted connections of a user, either direction. */
export async function getConnectionIds(userId: string): Promise<Set<string>> {
  const { data, error } = await createAdminClient()
    .from("connections").select("requester_id, recipient_id").eq("status", "accepted")
    .or(`requester_id.eq.${uuid(userId)},recipient_id.eq.${uuid(userId)}`);
  if (error) throw error;
  return new Set((data ?? []).map((r) => (r.requester_id === userId ? r.recipient_id : r.requester_id) as string));
}

/** Every block edge that involves the user, in either direction. */
export async function getBlockEdges(userId: string): Promise<BlockEdge[]> {
  const { data, error } = await createAdminClient()
    .from("blocks").select("blocker_id, blocked_id")
    .or(`blocker_id.eq.${uuid(userId)},blocked_id.eq.${uuid(userId)}`);
  if (error) throw error;
  return (data ?? []).map((r) => ({ blockerId: r.blocker_id as string, blockedId: r.blocked_id as string }));
}

/** Recipients who already hold a pending invitation to the event. */
export async function getPendingEventInviteeIds(eventId: string, recipientIds: readonly string[]): Promise<Set<string>> {
  if (recipientIds.length === 0) return new Set();
  const { data, error } = await createAdminClient()
    .from("invitations").select("recipient_id")
    .eq("kind", "event").eq("event_id", eventId).eq("status", "pending").in("recipient_id", recipientIds);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.recipient_id as string));
}

/** Inserts invitations(kind='event'); never touches rsvps. */
export async function createEventInvitations(input: {
  senderId: string; groupId: string; eventId: string; recipientIds: readonly string[];
}): Promise<string[]> {
  if (input.recipientIds.length === 0) return [];
  const rows = input.recipientIds.map((recipientId) => ({
    kind: "event", group_id: input.groupId, event_id: input.eventId, sender_id: input.senderId, recipient_id: recipientId,
  }));
  const { data, error } = await createAdminClient().from("invitations").insert(rows).select("id");
  if (error) throw error;
  return (data ?? []).map((r) => r.id as string);
}

export type PendingConnectionRequest = { id: string; requesterId: string; message: string | null; createdAt: string };

export async function getPendingConnectionRequests(userId: string): Promise<PendingConnectionRequest[]> {
  const { data, error } = await createAdminClient()
    .from("connections").select("id, requester_id, message, created_at")
    .eq("recipient_id", userId).eq("status", "pending").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string, requesterId: r.requester_id as string, message: (r.message ?? null) as string | null, createdAt: r.created_at as string,
  }));
}
