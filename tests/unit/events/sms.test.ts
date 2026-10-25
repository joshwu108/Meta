import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const users = new Map<string, string>([["maya", "maya@weave.test"], ["leo", "leo@weave.test"]]);
const titles = new Map<string, string>([["e1", "Beginner Pottery & Coffee Night"]]);
vi.mock("@/features/events/server/stubs/clients", () => ({
  createAdminClient: () => ({
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: users.has(id) ? { email: users.get(id) } : null } }) } },
    from: () => ({
      select: () => ({ eq: (_c: string, id: string) => ({ maybeSingle: async () => ({ data: titles.has(id) ? { title: titles.get(id) } : null }) }) }),
    }),
  }),
}));

const logs: Array<{ msg: string; fields: Record<string, unknown> }> = [];
vi.mock("@/lib/log", () => ({
  log: {
    info: (msg: string, fields: Record<string, unknown>) => logs.push({ msg, fields }),
    warn: (msg: string, fields: Record<string, unknown>) => logs.push({ msg, fields }),
  },
}));

const { eventSmsText, smsConfig, textEventNotification, withEventSms } = await import("@/features/events/server/sms");

const ENV = { SMS_DEMO_TO: "+14155550123", SMS_DEMO_USER_EMAIL: "Maya@Weave.test", NEXT_PUBLIC_SITE_URL: "https://cg.example/" };
const KEYS = { TWILIO_ACCOUNT_SID: "AC123", TWILIO_AUTH_TOKEN: "secret", TWILIO_FROM: "+14155550100" };

beforeEach(() => {
  logs.length = 0;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("smsConfig", () => {
  it("is off unless both the demo number and the demo user are set", () => {
    expect(smsConfig({})).toBeNull();
    expect(smsConfig({ SMS_DEMO_TO: ENV.SMS_DEMO_TO })).toBeNull();
    expect(smsConfig({ SMS_DEMO_USER_EMAIL: ENV.SMS_DEMO_USER_EMAIL })).toBeNull();
  });

  it("rejects a number that is not E.164", () => {
    expect(smsConfig({ ...ENV, SMS_DEMO_TO: "415-555-0123" })).toBeNull();
  });

  it("logs instead of sending until every Twilio key is present", () => {
    expect(smsConfig(ENV)).toEqual({ to: "+14155550123", userEmail: "maya@weave.test", siteUrl: "https://cg.example", twilio: null });
    expect(smsConfig({ ...ENV, TWILIO_ACCOUNT_SID: "AC123" })?.twilio).toBeNull();
    expect(smsConfig({ ...ENV, ...KEYS })?.twilio).toEqual({ accountSid: "AC123", authToken: "secret", from: "+14155550100" });
  });
});

describe("eventSmsText", () => {
  const site = "https://cg.example";

  it("words each event notification with a link back to the app", () => {
    expect(eventSmsText("rsvp_confirmed", { href: "/events/e1" }, "Pottery Night", site))
      .toBe("Weave: you're going to Pottery Night. https://cg.example/events/e1");
    expect(eventSmsText("rsvp_confirmed", { promotedFromWaitlist: true }, "Pottery Night", null))
      .toBe("Weave: a spot opened up. You're in for Pottery Night.");
    expect(eventSmsText("event_updated", {}, "Pottery Night", null)).toBe("Weave: Pottery Night changed. Please reconfirm your spot.");
    expect(eventSmsText("event_cancelled", { reason: "Kiln broke" }, "Pottery Night", null))
      .toBe("Weave: Pottery Night was cancelled: Kiln broke");
    expect(eventSmsText("reconnect_suggestion", { href: "/activity" }, "Pottery Night", site))
      .toBe("Weave: your agents found a follow-up with someone from Pottery Night. https://cg.example/activity");
    expect(eventSmsText("reconnect_suggestion", { accepted: true }, null, null)).toBe("Weave: you're both in for a follow-up.");
  });

  it("never texts other notification types", () => {
    expect(eventSmsText("group_invite", { href: "/events/e1" }, "Pottery Night", site)).toBeNull();
    expect(eventSmsText("connection_request", {}, null, site)).toBeNull();
  });
});

describe("textEventNotification", () => {
  it("does nothing when SMS is off", async () => {
    await textEventNotification("maya", "rsvp_confirmed", { eventId: "e1" }, null);
    expect(logs).toEqual([]);
  });

  it("only texts the configured demo user", async () => {
    await textEventNotification("leo", "rsvp_confirmed", { eventId: "e1" }, smsConfig(ENV));
    expect(logs).toEqual([]);
  });

  it("logs the text, with the event title looked up, when Twilio keys are missing", async () => {
    await textEventNotification("maya", "rsvp_confirmed", { eventId: "e1", href: "/events/e1" }, smsConfig(ENV));
    expect(logs).toEqual([{
      msg: "sms.console",
      fields: { userId: "maya", type: "rsvp_confirmed", text: "Weave: you're going to Beginner Pottery & Coffee Night. https://cg.example/events/e1" },
    }]);
  });

  it("sends through Twilio's Messages API to the demo number", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await textEventNotification("maya", "event_cancelled", { title: "Pottery Night", reason: "Kiln broke" }, smsConfig({ ...ENV, ...KEYS }));

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("AC123:secret").toString("base64")}`);
    expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({
      To: "+14155550123", From: "+14155550100", Body: "Weave: Pottery Night was cancelled: Kiln broke",
    });
    expect(logs).toEqual([{ msg: "sms.sent", fields: { userId: "maya", type: "event_cancelled" } }]);
  });

  it("never throws when Twilio fails, so the RSVP still succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));
    await expect(textEventNotification("maya", "event_updated", { title: "Pottery Night" }, smsConfig({ ...ENV, ...KEYS }))).resolves.toBeUndefined();
    expect(logs).toEqual([{ msg: "sms.failed", fields: { userId: "maya", type: "event_updated", detail: "Twilio answered 401" } }]);
  });
});

describe("withEventSms", () => {
  it("always delivers the in-app notification first, unchanged", async () => {
    const notify = vi.fn(async () => undefined);
    await withEventSms(notify)("leo", "group_invite", { eventId: "e1" });
    expect(notify).toHaveBeenCalledWith("leo", "group_invite", { eventId: "e1" });
  });

  it("does not text when the in-app notification fails", async () => {
    const notify = vi.fn(async () => {
      throw new Error("insert failed");
    });
    await expect(withEventSms(notify)("maya", "rsvp_confirmed", { eventId: "e1" })).rejects.toThrow("insert failed");
    expect(logs).toEqual([]);
  });
});
