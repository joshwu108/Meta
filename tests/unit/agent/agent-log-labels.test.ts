import { describe, expect, it } from "vitest";
import { permissionLabel, permissionsLabel } from "@/features/agent/components/labels";
import { timeAgo } from "@/features/agent/components/agent-log";

describe("activity log labels", () => {
  it.each([
    ["matching", "people matching"],
    ["demand", "community demand"],
    ["allow_demand_aggregation", "community demand"],
    ["group_plan", "group planning"],
    ["attendees", "event attendee list"],
    ["reconnect", "reconnecting after an event"],
    ["some_new_key", "some new key"],
  ])("%s → %s", (key, label) => {
    expect(permissionLabel(key)).toBe(label);
  });

  it("joins distinct labels for one row", () => {
    expect(permissionsLabel(["demand", "allow_demand_aggregation", "group_plan"])).toBe("community demand, group planning");
    expect(permissionsLabel([])).toBe("");
  });

  it("formats times relative to now", () => {
    const now = Date.parse("2026-10-25T12:00:00Z");
    expect(timeAgo("2026-10-25T11:59:40Z", now)).toBe("just now");
    expect(timeAgo("2026-10-25T11:15:00Z", now)).toBe("45m ago");
    expect(timeAgo("2026-10-25T09:00:00Z", now)).toBe("3h ago");
    expect(timeAgo("2026-10-23T12:00:00Z", now)).toBe("2d ago");
  });
});
