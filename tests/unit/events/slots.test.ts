import { describe, expect, it, vi } from "vitest";
import { deriveSlot, localParts } from "@/features/events/server/slots";

vi.mock("server-only", () => ({}));

describe("deriveSlot (America/Los_Angeles)", () => {
  it.each([
    ["2026-10-30T02:00:00Z", "thu_eve"], // Thu 19:00 PDT
    ["2026-10-27T00:30:00Z", "mon_eve"], // Mon 17:30 PDT
    ["2026-10-31T03:59:00Z", "fri_eve"], // Fri 20:59 PDT
    ["2026-10-31T17:00:00Z", "sat_day"], // Sat 10:00 PDT
    ["2026-11-01T01:00:00Z", "sat_eve"], // Sat 18:00 PDT
    ["2026-11-01T18:00:00Z", "sun_day"], // Sun 10:00 PST (DST ended 09:00Z that day)
    ["2026-11-02T02:00:00Z", "sun_eve"], // Sun 18:00 PST
  ])("%s → %s", (iso, slot) => {
    expect(deriveSlot(iso)).toBe(slot);
  });

  it("returns null for weekday daytime events", () => {
    expect(deriveSlot("2026-10-28T19:00:00Z")).toBeNull(); // Wed 12:00 PDT
  });

  it("treats events before 05:00 local as belonging to the previous evening", () => {
    expect(deriveSlot("2026-10-30T08:30:00Z")).toBe("thu_eve"); // Fri 01:30 PDT
  });

  it("uses Pacific time across the spring-forward boundary", () => {
    // 2026-03-08 is the DST start; 17:00 PDT that Sunday is 00:00Z Monday
    expect(deriveSlot("2026-03-09T00:00:00Z")).toBe("sun_eve");
    // 16:59 PST the day before is 00:59Z Sunday, still Saturday daytime
    expect(deriveSlot("2026-03-08T00:59:00Z")).toBe("sat_day");
  });

  it("uses Pacific time across the fall-back boundary", () => {
    // 2026-11-01 01:30 happens twice; both are late Saturday night → sat_eve
    expect(deriveSlot("2026-11-01T08:30:00Z")).toBe("sat_eve"); // 01:30 PDT
    expect(deriveSlot("2026-11-01T09:30:00Z")).toBe("sat_eve"); // 01:30 PST
  });

  it("exposes local weekday and hour", () => {
    expect(localParts("2026-10-30T02:00:00Z")).toEqual({ weekday: 4, hour: 19, minute: 0 });
  });

  it("rejects invalid timestamps", () => {
    expect(() => deriveSlot("not a date")).toThrow(RangeError);
  });
});
