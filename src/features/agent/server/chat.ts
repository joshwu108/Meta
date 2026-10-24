import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SharablePreferences } from "@/shared/types";
import {
  ChatModelOutputSchema,
  DEFAULT_CONSENT,
  type ChatModelOutput,
  type ChatResponse,
  type SuggestionCard,
  type UserPreferences,
} from "../schemas";
import { explainDetailed, type ExplainTarget } from "./explain";
import { feedbackForPrompt } from "./feedback";
import * as repo from "./repo";
import { toSharable } from "./sharable";
import { logAgentAction } from "@/features/core";
import { generateStructured } from "@/lib/ai";
import { suggestEvents, suggestGroups, suggestPeople } from "./suggestion-stubs";

const ALL_CONSENT = { ...DEFAULT_CONSENT, allow_matching: true, allow_demand_aggregation: true, allow_group_planning: true };

/** The viewer's own preferences in the shared shape, for explanations shown only to them. */
export function selfView(userId: string, preferences: UserPreferences): SharablePreferences {
  const view = toSharable(
    { userId, preferences, consent: ALL_CONSENT, isDiscoverable: true, neighborhood: null, coarseLat: null, coarseLng: null },
    "demand",
  );
  if (!view) throw new Error("selfView: unreachable");
  return view;
}

async function card(
  viewer: SharablePreferences,
  target: ExplainTarget,
  base: Omit<SuggestionCard, "explanation" | "highlights">,
): Promise<SuggestionCard> {
  const why = await explainDetailed({ viewer, target, breakdown: {} });
  return { ...base, explanation: why.explanation, highlights: why.highlights };
}

type Capability = ChatModelOutput["capabilities"][number];

/** Run model-requested capabilities deterministically and turn them into cards. */
export async function runCapabilities(
  userId: string,
  viewer: SharablePreferences,
  capabilities: readonly Capability[],
): Promise<SuggestionCard[]> {
  const batches = await Promise.all(capabilities.map((c) => runOne(userId, viewer, c)));
  return batches.flat().slice(0, 6);
}

async function runOne(userId: string, viewer: SharablePreferences, cap: Capability): Promise<SuggestionCard[]> {
  switch (cap.name) {
    case "suggest_people":
      return Promise.all(
        (await suggestPeople(userId)).map((p) =>
          card(viewer, { kind: "person", preferences: p.preferences, displayName: p.displayName }, {
            kind: "person", targetId: p.id, title: p.displayName, subtitle: p.neighborhood, href: `/match?focus=${p.id}`,
          }),
        ),
      );
    case "suggest_events":
      return Promise.all(
        (await suggestEvents(userId)).map((e) =>
          card(viewer, { kind: "event", event: e }, {
            kind: "event", targetId: e.id, title: e.title, subtitle: e.venue, href: `/events/${e.id}`,
          }),
        ),
      );
    case "suggest_groups":
      return Promise.all(
        (await suggestGroups(userId)).map((g) =>
          card(viewer, { kind: "group", group: g }, {
            kind: "group", targetId: g.id, title: g.name, subtitle: `${g.memberCount} members`, href: `/groups/${g.id}`,
          }),
        ),
      );
    case "update_preference":
      return cap.patch && Object.keys(cap.patch).length > 0
        ? [{
            kind: "preference_update", targetId: "preferences", title: "Update your preferences",
            subtitle: describePatch(cap.patch), href: "/agent/preferences",
            explanation: "Your agent suggested this from your chat. Nothing changes until you tap Apply.",
            highlights: [], patch: cap.patch,
          }]
        : [];
  }
}

function describePatch(patch: NonNullable<Capability["patch"]>): string {
  return Object.entries(patch)
    .map(([k, v]) => `${k.replace(/([A-Z])/g, " $1").toLowerCase()}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
    .join("; ")
    .slice(0, 200);
}

/** One `/agent` chat turn. Context: approved summary, preferences, last 20 messages. */
export async function handleChatMessage(
  sb: SupabaseClient,
  userId: string,
  message: string,
  conversationId?: string,
): Promise<ChatResponse> {
  const convId = await repo.resolveConversation(sb, userId, "chat", conversationId);
  const [history, prefs, profile, feedback] = await Promise.all([
    repo.listMessages(sb, convId, 20),
    repo.getPreferences(sb, userId),
    repo.getAgentProfile(sb, userId),
    repo.getFeedbackNotes(sb, userId),
  ]);
  const { fieldSources: _sources, ...preferences } = prefs;
  void _sources;
  const out = await generateStructured({
    prompt: "agent.chat",
    input: {
      summary: profile.summary,
      preferences,
      feedback: feedbackForPrompt(feedback),
      messages: [...history.map(({ role, content }) => ({ role, content })), { role: "user", content: message }],
    },
    schema: ChatModelOutputSchema,
    model: "smart",
  });
  const suggestions = await runCapabilities(userId, selfView(userId, preferences), out.capabilities);
  await repo.addMessages(sb, convId, [
    { role: "user", content: message, suggestions: null },
    { role: "assistant", content: out.reply, suggestions: suggestions.length ? suggestions : null },
  ]);
  if (out.capabilities.length > 0) {
    await logAgentAction({
      userId,
      action: "chat_suggestions",
      permissionsUsed: [],
      result: `Suggested ${suggestions.length} ${suggestions.length === 1 ? "item" : "items"} in chat`,
    });
  }
  return { conversationId: convId, reply: out.reply, ...(suggestions.length ? { suggestions } : {}) };
}
