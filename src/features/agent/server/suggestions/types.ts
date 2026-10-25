import "server-only";
import type { SharablePreferences } from "@/shared/types";

/**
 * Suggestion card candidate types shared by the three sources in this folder: people
 * (./people.ts), groups (./groups.ts, 03's export) and events (./events.ts, 06's export).
 */

export type PersonCandidate = { id: string; displayName: string; neighborhood: string; preferences: SharablePreferences };
export type EventCandidate = { id: string; title: string; startsAt: string; venue: string; category: string; description: string };
export type GroupCandidate = { id: string; name: string; description: string; memberCount: number };
