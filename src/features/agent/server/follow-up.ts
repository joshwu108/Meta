import "server-only";
import type { EventPublic, SharablePreferences } from "@/shared/types";
import { FollowUpSuggestionSchema, type FollowUpSuggestion } from "../schemas";
import { logAgentAction } from "@/features/core";
import { ApiError } from "@/lib/api";
import { generateStructured } from "@/lib/ai";
import type { AvailabilitySlot } from "@/shared/enums";

/**
 * P1, invoked by 06 after it has verified mutual reconnect interest. Both inputs
 * must come from `getSharablePreferences`, so only consented fields are used.
 */
export async function suggestFollowUp(input: {
  a: SharablePreferences;
  b: SharablePreferences;
  event: Pick<EventPublic, "title" | "category" | "startsAt">;
}): Promise<FollowUpSuggestion> {
  if (input.a.userId === input.b.userId) throw new ApiError("VALIDATION", "A follow-up needs two different people");
  const sharedSlots = input.a.availabilitySlots.filter((s) => input.b.availabilitySlots.includes(s));
  const sharedInterests = input.a.interests.filter((i) => input.b.interests.includes(i));
  const out = await generateStructured({
    prompt: "agent.follow_up_suggestion",
    input: { event: input.event, sharedInterests, sharedSlots },
    schema: FollowUpSuggestionSchema,
    model: "smart",
  });
  const suggestion = { ...out, suggestedSlot: pickSlot(out.suggestedSlot, input.a.availabilitySlots, input.b.availabilitySlots) };
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

/**
 * Prefer a slot both people are free; with none shared, keep the model's pick only if at least one
 * of them is free then, else the first slot either of them gave. Never a slot neither person has.
 */
export function pickSlot(proposed: AvailabilitySlot, a: readonly AvailabilitySlot[], b: readonly AvailabilitySlot[]): AvailabilitySlot {
  const shared = a.filter((s) => b.includes(s));
  if (shared.length > 0) return shared.includes(proposed) ? proposed : (shared[0] as AvailabilitySlot);
  const either = [...a, ...b];
  return either.includes(proposed) || either.length === 0 ? proposed : (either[0] as AvailabilitySlot);
}
