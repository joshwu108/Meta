import "server-only";
import type { EventPublic, SharablePreferences } from "@/shared/types";
import { FollowUpSuggestionSchema, type FollowUpSuggestion } from "../schemas";
import { logAgentAction } from "@/features/core";
import { generateStructured } from "@/lib/ai";

/**
 * P1, invoked by 06 after it has verified mutual reconnect interest. Both inputs
 * must come from `getSharablePreferences`, so only consented fields are used.
 */
export async function suggestFollowUp(input: {
  a: SharablePreferences;
  b: SharablePreferences;
  event: Pick<EventPublic, "title" | "category" | "startsAt">;
}): Promise<FollowUpSuggestion> {
  const sharedSlots = input.a.availabilitySlots.filter((s) => input.b.availabilitySlots.includes(s));
  const sharedInterests = input.a.interests.filter((i) => input.b.interests.includes(i));
  const out = await generateStructured({
    prompt: "agent.follow_up_suggestion",
    input: { event: input.event, sharedInterests, sharedSlots },
    schema: FollowUpSuggestionSchema,
    model: "smart",
  });
  const firstShared = sharedSlots[0];
  const suggestion = firstShared !== undefined && !sharedSlots.includes(out.suggestedSlot)
    ? { ...out, suggestedSlot: firstShared }
    : out;
  await Promise.all(
    [input.a.userId, input.b.userId].map((userId) =>
      logAgentAction({
        userId,
        actor: "personal_agent",
        action: "follow_up_suggestion",
        permissionsUsed: ["reconnect"],
        result: `Suggested a follow-up: ${suggestion.title}`,
      }),
    ),
  );
  return suggestion;
}
