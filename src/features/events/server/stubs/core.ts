import "server-only";
import { ApiError } from "@/lib/api";
import { getCurrentUser } from "@/features/core";
import { createAdminClient } from "./clients";

// 01's API helpers, clients and core contracts, re-exported so 06's modules keep one import path.

export { ApiError, fail, ok, parseBody, toErrorResponse, withAuth, type AuthCtx, type ErrorCode } from "@/lib/api";
export { logAgentAction, notify } from "@/features/core";
export { createAdminClient, createUserClient } from "./clients";

export type NotificationItem = { id: string; type: string; payload: Record<string, unknown>; readAt: string | null; createdAt: string };

/** Latest notifications for the Activity hub (01 owns the table and GET /api/notifications). */
export async function listNotifications(userId: string, limit = 20): Promise<NotificationItem[]> {
  const { data, error } = await createAdminClient()
    .from("notifications").select("id, type, payload, read_at, created_at")
    .eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
  if (error) throw new ApiError("INTERNAL", "Could not load notifications");
  return (data ?? []).map((n) => ({
    id: n.id as string, type: n.type as string, payload: (n.payload ?? {}) as Record<string, unknown>,
    readAt: (n.read_at ?? null) as string | null, createdAt: n.created_at as string,
  }));
}

/** Signed-in user id for server components; null when there is no session. */
export async function getCurrentUserId(): Promise<string | null> {
  return (await getCurrentUser())?.id ?? null;
}
