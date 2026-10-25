import { describe, expect, it, vi } from "vitest";

const { suggestEventsFrom } = await import("@/features/agent/server/suggestions/events");

const rec = (id: string, venue: string) => ({
  event: { id, title: `Event ${id}`, startsAt: "2026-10-29T19:00:00-07:00", category: "creative", description: "d", business: { name: venue } },
});

describe("suggestEventsFrom", () => {
  it("maps 06's recommended events to agent event candidates for the viewer", async () => {
    const recommended = vi.fn(async () => [rec("e1", "Kiln & Cup"), rec("e2", "Meeple House")]);
    const out = await suggestEventsFrom({ recommended }, "viewer-1", 2);
    expect(recommended).toHaveBeenCalledWith("viewer-1", 2);
    expect(out).toEqual([
      { id: "e1", title: "Event e1", startsAt: "2026-10-29T19:00:00-07:00", venue: "Kiln & Cup", category: "creative", description: "d" },
      { id: "e2", title: "Event e2", startsAt: "2026-10-29T19:00:00-07:00", venue: "Meeple House", category: "creative", description: "d" },
    ]);
  });

  it("returns nothing when there are no upcoming events", async () => {
    expect(await suggestEventsFrom({ recommended: async () => [] }, "v")).toEqual([]);
  });
});
