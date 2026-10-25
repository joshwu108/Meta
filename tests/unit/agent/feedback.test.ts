import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeRepo } from "./fake-repo";

const fake = createFakeRepo();
vi.mock("@/features/agent/server/repo", () => fake.repo);
vi.mock("@/features/core", () => ({
  logAgentAction: async () => undefined,
}));
vi.mock("@/lib/ai", async () => (await import("./mock-ai")).mockAi);
vi.mock("@/features/agent/server/people", () => ({ suggestPeople: async () => [] }));
vi.mock("@/features/agent/server/events", () => ({ suggestEvents: async () => [] }));
const { appendFeedback, feedbackForPrompt, recordFeedback, MAX_FEEDBACK_NOTES } = await import("@/features/agent/server/feedback");
const { parseFeedbackNotes } = await import("@/features/agent/server/rows");
const { FeedbackRequestSchema } = await import("@/features/agent/schemas");
const { handleChatMessage } = await import("@/features/agent/server/chat");

const note = (about: string, signal: "up" | "down" = "up") => ({ at: "2026-10-24T00:00:00Z", about, signal });

beforeEach(() => fake.state.feedback.clear());

describe("feedback memory", () => {
  it("keeps one note per target, newest wins, capped", () => {
    const out = appendFeedback([note("event:1"), note("event:2")], note("event:1", "down"));
    expect(out).toEqual([note("event:2"), note("event:1", "down")]);
    const many = Array.from({ length: MAX_FEEDBACK_NOTES + 5 }, (_, i) => note(`event:${i}`));
    expect(many.reduce(appendFeedback, [] as ReturnType<typeof note>[])).toHaveLength(MAX_FEEDBACK_NOTES);
  });

  it("validates targets and drops malformed stored notes", () => {
    expect(FeedbackRequestSchema.safeParse({ about: "event:abc-1", signal: "up" }).success).toBe(true);
    expect(FeedbackRequestSchema.safeParse({ about: "message:1", signal: "up" }).success).toBe(false);
    expect(parseFeedbackNotes([note("event:1"), { junk: true }, "x"])).toEqual([note("event:1")]);
    expect(parseFeedbackNotes(null)).toEqual([]);
  });

  it("injects only the last 10 notes, without timestamps", () => {
    const notes = Array.from({ length: 12 }, (_, i) => note(`group:${i}`));
    const out = feedbackForPrompt(notes);
    expect(out).toHaveLength(10);
    expect(out[0]).toEqual({ about: "group:2", signal: "up" });
  });

  it("records feedback and passes it to the chat prompt", async () => {
    await recordFeedback({} as never, "u1", { about: "event:42", signal: "down", note: "too loud" });
    expect(fake.state.feedback.get("u1")).toEqual([expect.objectContaining({ about: "event:42", signal: "down" })]);
    fake.repo.getFeedbackNotes.mockClear();
    await handleChatMessage({} as never, "u1", "anything this week?");
    expect(fake.repo.getFeedbackNotes).toHaveBeenCalledWith({}, "u1");
  });
});
