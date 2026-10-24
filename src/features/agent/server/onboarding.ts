import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ExtractedPreferencesSchema,
  PREFERENCE_FIELDS,
  type ChatResponse,
  type ConfirmRequest,
  type OnboardBasics,
  type UserPreferencesWithSources,
} from "../schemas";
import { groundExtraction, mergeExtraction, nextOnboardingStep, recap } from "./extraction";
import { EXTRACT_SYSTEM } from "./prompts";
import * as repo from "./repo";
import { generateStructured, logAgentAction } from "./stubs";

/** Step 1: neighborhood, coarse location (rounded to 2 dp), travel radius. */
export async function saveBasics(sb: SupabaseClient, userId: string, basics: OnboardBasics): Promise<void> {
  const round = (n: number) => Math.round(n * 100) / 100;
  await repo.updateProfile(sb, userId, {
    neighborhood: basics.neighborhood,
    coarse_lat: round(basics.coarseLat),
    coarse_lng: round(basics.coarseLng),
  });
  const current = await repo.getPreferences(sb, userId);
  await repo.savePreferences(sb, userId, {
    ...current,
    travelRadiusKm: basics.travelRadiusKm,
    fieldSources: { ...current.fieldSources, travelRadiusKm: "user_set" },
  });
}

/** Step 2: one onboarding turn. Extract → merge as `ai_inferred` → ask a follow-up or finish. */
export async function handleOnboardingMessage(
  sb: SupabaseClient,
  userId: string,
  message: string,
  conversationId?: string,
): Promise<ChatResponse> {
  const convId = await repo.resolveConversation(sb, userId, "onboarding", conversationId);
  const [history, current] = await Promise.all([
    repo.listMessages(sb, convId, 20),
    repo.getPreferences(sb, userId),
  ]);
  const transcript = [...history.map(({ role, content }) => ({ role, content })), { role: "user", content: message }];
  const userText = transcript.filter((m) => m.role === "user").map((m) => m.content).join("\n");

  const { fieldSources: _sources, ...currentPreferences } = current;
  void _sources;
  const raw = await generateStructured({
    prompt: "agent.extract_preferences",
    input: { transcript, currentPreferences },
    schema: ExtractedPreferencesSchema,
    system: EXTRACT_SYSTEM,
    model: "smart",
  });
  const extracted = groundExtraction(raw, userText);
  const merged = mergeExtraction(current, extracted);
  await Promise.all([
    repo.savePreferences(sb, userId, merged),
    repo.saveAgentProfile(sb, userId, { summary: extracted.summary }),
  ]);

  const userTurns = transcript.filter((m) => m.role === "user").length;
  const followUpsAsked = history.filter((m) => m.role === "assistant").length;
  const step = nextOnboardingStep(extracted, userTurns, followUpsAsked);
  const reply = step.done ? `${recap(merged)} Take a look and adjust anything I got wrong.` : step.question;

  await repo.addMessages(sb, convId, [
    { role: "user", content: message, suggestions: null },
    { role: "assistant", content: reply, suggestions: null },
  ]);
  await logAgentAction({
    userId,
    action: "extract_preferences",
    permissionsUsed: [],
    result: `Updated ${changedFieldCount(current, merged)} preference fields from onboarding`,
  });
  return { conversationId: convId, reply, extracted, done: step.done };
}

function changedFieldCount(before: UserPreferencesWithSources, after: UserPreferencesWithSources): number {
  return PREFERENCE_FIELDS.filter((f) => JSON.stringify(before[f]) !== JSON.stringify(after[f])).length;
}

/** Step 3: user reviewed everything. Every field becomes `user_set`; onboarding completes. */
export async function confirmOnboarding(sb: SupabaseClient, userId: string, req: ConfirmRequest): Promise<void> {
  const current = await repo.getPreferences(sb, userId);
  const allUserSet = Object.fromEntries(PREFERENCE_FIELDS.map((f) => [f, "user_set" as const]));
  await repo.savePreferences(sb, userId, { ...current, fieldSources: allUserSet });
  await repo.saveAgentProfile(sb, userId, { consent: req.consent });
  await repo.updateProfile(sb, userId, {
    is_discoverable: req.discoverable,
    onboarding_completed_at: new Date().toISOString(),
  });
  await logAgentAction({
    userId,
    action: "confirm_preferences",
    permissionsUsed: Object.entries(req.consent).filter(([, on]) => on).map(([k]) => k),
    result: "You confirmed your preferences and sharing settings",
  });
}
