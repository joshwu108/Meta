import { vi } from "vitest";
import {
  DEFAULT_CONSENT,
  EMPTY_PREFERENCES,
  type Consent,
  type UserPreferencesWithSources,
} from "@/features/agent/schemas";
import type { StoredMessage } from "@/features/agent/server/repo";
import { ApiError } from "@/features/agent/server/stubs";

/** In-memory stand-in for server/repo.ts so services run without Postgres. */
export function createFakeRepo() {
  const state = {
    prefs: new Map<string, UserPreferencesWithSources>(),
    agent: new Map<string, { summary: string | null; consent: Consent }>(),
    convs: new Map<string, { userId: string; kind: string; messages: StoredMessage[] }>(),
    profiles: new Map<string, Record<string, unknown>>(),
    log: [] as Record<string, unknown>[],
    feedback: new Map<string, unknown[]>(),
  };
  let seq = 0;
  const repo = {
    getPreferences: vi.fn(async (_sb: unknown, userId: string) =>
      state.prefs.get(userId) ?? { ...EMPTY_PREFERENCES, fieldSources: {} }),
    savePreferences: vi.fn(async (_sb: unknown, userId: string, p: UserPreferencesWithSources) => {
      state.prefs.set(userId, structuredClone(p));
      return p;
    }),
    getAgentProfile: vi.fn(async (_sb: unknown, userId: string) =>
      state.agent.get(userId) ?? { summary: null, consent: { ...DEFAULT_CONSENT } }),
    saveAgentProfile: vi.fn(async (_sb: unknown, userId: string, patch: { summary?: string | null; consent?: Consent }) => {
      const cur = state.agent.get(userId) ?? { summary: null, consent: { ...DEFAULT_CONSENT } };
      const next = { ...cur, ...patch };
      state.agent.set(userId, next);
      return next;
    }),
    resolveConversation: vi.fn(async (_sb: unknown, userId: string, kind: string, id?: string) => {
      if (id) {
        const c = state.convs.get(id);
        if (!c || c.userId !== userId) throw new ApiError("NOT_FOUND", "Conversation not found");
        return id;
      }
      const existing = [...state.convs.entries()].reverse().find(([, c]) => c.userId === userId && c.kind === kind);
      if (existing) return existing[0];
      const newId = `conv-${++seq}`;
      state.convs.set(newId, { userId, kind, messages: [] });
      return newId;
    }),
    listMessages: vi.fn(async (_sb: unknown, id: string, limit = 20) => state.convs.get(id)!.messages.slice(-limit)),
    addMessages: vi.fn(async (_sb: unknown, id: string, msgs: StoredMessage[]) => {
      state.convs.get(id)!.messages.push(...msgs);
    }),
    updateProfile: vi.fn(async (_sb: unknown, userId: string, values: Record<string, unknown>) => {
      state.profiles.set(userId, { ...(state.profiles.get(userId) ?? {}), ...values });
    }),
    listAgentLog: vi.fn(async () => []),
    getFeedbackNotes: vi.fn(async (_sb: unknown, userId: string) => state.feedback.get(userId) ?? []),
    saveFeedbackNotes: vi.fn(async (_sb: unknown, userId: string, notes: unknown[]) => {
      state.feedback.set(userId, [...notes]);
    }),
  };
  return { state, repo };
}
