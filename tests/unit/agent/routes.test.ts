import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeRepo } from "./fake-repo";

const fake = createFakeRepo();
let currentUser: { id: string } | null = { id: "u1" };
vi.mock("@/features/agent/server/repo", () => fake.repo);
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: currentUser } }) } }),
}));
vi.mock("@/features/agent/server/stubs", async (orig) => ({
  ...(await orig<typeof import("@/features/agent/server/stubs")>()),
  logAgentAction: async () => undefined,
}));

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";

const chat = await import("@/app/api/agent/chat/route");
const prefs = await import("@/app/api/agent/preferences/route");
const confirm = await import("@/app/api/agent/preferences/confirm/route");
const perms = await import("@/app/api/agent/permissions/route");
const log = await import("@/app/api/agent/log/route");
const onboard = await import("@/app/api/users/onboard/route");
const { chatLimiter } = await import("@/features/agent/server/rate-limit");
const { DEFAULT_CONSENT } = await import("@/features/agent/schemas");

const ctx = { params: Promise.resolve({}) };
const req = (method: string, body?: unknown, url = "http://test/api") =>
  new Request(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });

beforeEach(() => {
  currentUser = { id: "u1" };
  chatLimiter.reset();
  fake.state.prefs.clear();
  fake.state.convs.clear();
});

describe("agent routes", () => {
  it("rejects unauthenticated calls with the envelope", async () => {
    currentUser = null;
    const res = await prefs.GET(req("GET"), ctx);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: { code: "UNAUTHENTICATED", message: expect.any(String) } });
  });

  it("returns VALIDATION with field paths for a bad body", async () => {
    const res = await chat.POST(req("POST", { kind: "other", message: "" }), ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.details.map((d: { path: string }) => d.path)).toEqual(expect.arrayContaining(["kind", "message"]));
  });

  it("returns VALIDATION for non-JSON bodies", async () => {
    const res = await chat.POST(new Request("http://test", { method: "POST", body: "nope" }), ctx);
    expect((await res.json()).error.code).toBe("VALIDATION");
  });

  it("runs an onboarding turn", async () => {
    const res = await chat.POST(req("POST", { kind: "onboarding", message: "I like pottery on Thursday evenings" }), ctx);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toMatchObject({ done: true, conversationId: expect.any(String) });
  });

  it("rate limits chat at 30 calls per 10 minutes", async () => {
    for (let i = 0; i < 30; i++) chatLimiter.take("u1");
    const res = await chat.POST(req("POST", { kind: "chat", message: "hi" }), ctx);
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe("RATE_LIMITED");
  });

  it("returns 404 for someone else's conversation", async () => {
    const res = await chat.POST(
      req("POST", { kind: "chat", message: "hi", conversationId: "5b4a8b0e-2f7c-4b52-9a4c-1d3c1c2b9e10" }),
      ctx,
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });

  it("GET and PATCH preferences", async () => {
    const patched = await prefs.PATCH(req("PATCH", { interests: ["Pottery"] }), ctx);
    expect((await patched.json()).data).toMatchObject({ interests: ["pottery"], fieldSources: { interests: "user_set" } });
    const got = await prefs.GET(req("GET"), ctx);
    expect((await got.json()).data.interests).toEqual(["pottery"]);
  });

  it("rejects unknown preference fields", async () => {
    const res = await prefs.PATCH(req("PATCH", { userId: "someone-else" }), ctx);
    expect(res.status).toBe(400);
  });

  it("confirm, permissions and basics respond ok", async () => {
    expect((await (await confirm.POST(req("POST", { discoverable: true, consent: DEFAULT_CONSENT }), ctx)).json()).ok).toBe(true);
    const p = await perms.PATCH(req("PATCH", { allow_matching: true }), ctx);
    expect((await p.json()).data.allow_matching).toBe(true);
    expect((await (await perms.GET(req("GET"), ctx)).json()).data.allow_matching).toBe(true);
    const b = await onboard.POST(
      req("POST", { step: "basics", neighborhood: "Mission", coarseLat: 37.76, coarseLng: -122.42, travelRadiusKm: 5 }),
      ctx,
    );
    expect((await b.json()).ok).toBe(true);
  });

  it("clamps the log limit", async () => {
    const res = await log.GET(req("GET", undefined, "http://test/api/agent/log?limit=500"), ctx);
    expect(res.status).toBe(400);
    const okRes = await log.GET(req("GET", undefined, "http://test/api/agent/log?limit=10"), ctx);
    expect((await okRes.json()).meta).toEqual({ limit: 10 });
  });
});
