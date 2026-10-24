import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

const notify = vi.fn();
vi.mock("@/features/events/server/stubs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  notify: (...args: unknown[]) => notify(...args),
  getConsent: async () => ({
    allow_matching: true, allow_demand_aggregation: false, allow_group_planning: false,
    share_interests_with_attendees: true, share_name_with_business: false,
  }),
}));

const { cancelRsvp, reconfirmRsvp, rsvpToEvent } = await import("@/features/events/server/rsvp");

function client(result: { data?: unknown; error?: { message: string } | null }) {
  const rpc = vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null });
  return { rpc, db: { rpc } as unknown as SupabaseClient };
}

describe("rsvpToEvent", () => {
  beforeEach(() => notify.mockReset());

  it("fills omitted sharing choices from the agent's consent and notifies on confirmation", async () => {
    const { rpc, db } = client({ data: [{ rsvp_status: "confirmed", event_status: "published" }] });

    const out = await rsvpToEvent(db, "u1", "e1", { shareWithBusiness: true });

    expect(rpc).toHaveBeenCalledWith("rsvp_event", {
      p_event_id: "e1", p_share_attendees: true, p_share_business: true, p_allow_waitlist: false,
    });
    expect(out).toEqual({ status: "confirmed", eventStatus: "published" });
    expect(notify).toHaveBeenCalledWith("u1", "rsvp_confirmed", { eventId: "e1" });
  });

  it("does not send a confirmation for a waitlisted RSVP", async () => {
    vi.stubEnv("WAITLIST_ENABLED", "1");
    const { rpc, db } = client({ data: [{ rsvp_status: "waitlisted", event_status: "full" }] });

    await rsvpToEvent(db, "u1", "e1", {});

    expect(rpc.mock.calls[0]![1]).toMatchObject({ p_allow_waitlist: true });
    expect(notify).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it.each([
    ["CAPACITY_FULL", "CAPACITY_FULL", 409],
    ["ALREADY_RSVPED", "CONFLICT", 409],
    ["EVENT_NOT_OPEN", "CONFLICT", 409],
    ["EVENT_STARTED", "CONFLICT", 409],
    ["NOT_FOUND", "NOT_FOUND", 404],
    ["something unexpected", "INTERNAL", 500],
  ])("maps %s to %s", async (message, code, status) => {
    const { db } = client({ error: { message } });
    await expect(rsvpToEvent(db, "u1", "e1", {})).rejects.toMatchObject({ code, status });
  });
});

describe("cancelRsvp", () => {
  beforeEach(() => notify.mockReset());

  it("notifies a user promoted from the waitlist", async () => {
    const { db } = client({ data: [{ cancelled: true, promoted_user_id: "u2", event_status: "full" }] });

    await expect(cancelRsvp(db, "e1")).resolves.toEqual({ eventStatus: "full" });
    expect(notify).toHaveBeenCalledWith("u2", "rsvp_confirmed", { eventId: "e1", promotedFromWaitlist: true });
  });

  it("answers NOT_FOUND when there was nothing to cancel", async () => {
    const { db } = client({ data: [{ cancelled: false, promoted_user_id: null, event_status: "published" }] });
    await expect(cancelRsvp(db, "e1")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("reconfirmRsvp", () => {
  it("calls the reconfirm function and maps its errors", async () => {
    const ok = client({ data: null });
    await reconfirmRsvp(ok.db, "e1");
    expect(ok.rpc).toHaveBeenCalledWith("reconfirm_rsvp", { p_event_id: "e1" });

    const missing = client({ error: { message: "NOT_FOUND" } });
    await expect(reconfirmRsvp(missing.db, "e1")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
