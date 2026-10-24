import { describe, expect, it } from "vitest";
import { nextFollowUpStatus, type FollowUpStatus } from "@/features/events/server/follow-ups";

describe("nextFollowUpStatus", () => {
  it.each<[FollowUpStatus, "a" | "b", "accept" | "dismiss", FollowUpStatus | null]>([
    ["suggested", "a", "accept", "accepted_a"],
    ["suggested", "b", "accept", "accepted_b"],
    ["accepted_a", "b", "accept", "accepted_both"],
    ["accepted_b", "a", "accept", "accepted_both"],
    ["accepted_a", "a", "accept", "accepted_a"],
    ["accepted_b", "b", "accept", "accepted_b"],
    ["accepted_both", "a", "accept", "accepted_both"],
    ["suggested", "a", "dismiss", "dismissed"],
    ["accepted_a", "b", "dismiss", "dismissed"],
    ["accepted_both", "b", "dismiss", null],
    ["dismissed", "a", "accept", null],
    ["dismissed", "b", "dismiss", null],
  ])("%s + %s %s → %s", (current, side, action, expected) => {
    expect(nextFollowUpStatus(current, side, action)).toBe(expected);
  });
});
