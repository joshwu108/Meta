import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeedbackNote, FeedbackRequest } from "../schemas";
import * as repo from "./repo";

export const MAX_FEEDBACK_NOTES = 50;
export const PROMPT_FEEDBACK_NOTES = 10;

/** Keep the newest note per target and cap the list; never mutates. */
export function appendFeedback(notes: readonly FeedbackNote[], entry: FeedbackNote): FeedbackNote[] {
  return [...notes.filter((n) => n.about !== entry.about), entry].slice(-MAX_FEEDBACK_NOTES);
}

/** Compact form injected into the `agent.chat` prompt. */
export function feedbackForPrompt(notes: readonly FeedbackNote[]): { about: string; signal: string; note?: string }[] {
  return notes.slice(-PROMPT_FEEDBACK_NOTES).map(({ about, signal, note }) => (note ? { about, signal, note } : { about, signal }));
}

export async function recordFeedback(sb: SupabaseClient, userId: string, req: FeedbackRequest): Promise<FeedbackNote[]> {
  const current = await repo.getFeedbackNotes(sb, userId);
  const next = appendFeedback(current, { ...req, at: new Date().toISOString() });
  await repo.saveFeedbackNotes(sb, userId, next);
  return next;
}
