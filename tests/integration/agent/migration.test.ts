import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { addUser, asUser, createAgentDb } from "./pglite-db";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
let db: PGlite;

beforeAll(async () => {
  db = await createAgentDb();
  await addUser(db, A);
  await addUser(db, B);
}, 30_000);

type Row = Record<string, unknown>;
const rows = async (sql: string, params: unknown[] = []) => (await db.query<Row>(sql, params)).rows;

describe("0200_agent.sql on PGlite", () => {
  it("applies on top of core and enables RLS on every agent table", async () => {
    const tables = await rows(
      "select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename in ('user_preferences','agent_profiles','agent_conversations','agent_messages') order by 1",
    );
    expect(tables).toEqual([
      { tablename: "agent_conversations", rowsecurity: true },
      { tablename: "agent_messages", rowsecurity: true },
      { tablename: "agent_profiles", rowsecurity: true },
      { tablename: "user_preferences", rowsecurity: true },
    ]);
  });

  it("defaults consent to everything off", async () => {
    await asUser(db, A, () => db.query("insert into agent_profiles (user_id) values ($1)", [A]));
    const [row] = await rows("select consent from agent_profiles where user_id = $1", [A]);
    expect(Object.values(row.consent as Record<string, boolean>).every((v) => v === false)).toBe(true);
    expect(Object.keys(row.consent as object)).toHaveLength(5);
  });

  it("lets a user write their own preferences but not someone else's", async () => {
    await asUser(db, A, () => db.query("insert into user_preferences (user_id, interests) values ($1, '{pottery}')", [A]));
    await expect(
      asUser(db, A, () => db.query("insert into user_preferences (user_id, interests) values ($1, '{hacked}')", [B])),
    ).rejects.toThrow(/row-level security/);
  });

  it("hides and protects another user's preferences", async () => {
    const seen = await asUser(db, B, () => db.query("select * from user_preferences where user_id = $1", [A]));
    expect(seen.rows).toEqual([]);
    const updated = await asUser(db, B, () => db.query("update user_preferences set interests = '{x}' where user_id = $1", [A]));
    expect(updated.affectedRows).toBe(0);
    expect((await rows("select interests from user_preferences where user_id = $1", [A]))[0].interests).toEqual(["pottery"]);
  });

  it("keeps conversations and messages private, including inserts into a foreign conversation", async () => {
    const conv = await asUser(db, A, () =>
      db.query<{ id: string }>("insert into agent_conversations (user_id, kind) values ($1, 'onboarding') returning id", [A]),
    );
    const convId = conv.rows[0].id;
    await asUser(db, A, () => db.query("insert into agent_messages (conversation_id, role, content) values ($1, 'user', 'secret')", [convId]));
    expect((await asUser(db, B, () => db.query("select * from agent_messages"))).rows).toEqual([]);
    expect((await asUser(db, B, () => db.query("select * from agent_conversations"))).rows).toEqual([]);
    await expect(
      asUser(db, B, () => db.query("insert into agent_messages (conversation_id, role, content) values ($1, 'assistant', 'spoof')", [convId])),
    ).rejects.toThrow(/row-level security/);
    expect((await asUser(db, A, () => db.query("select content from agent_messages"))).rows).toEqual([{ content: "secret" }]);
  });

  it("enforces value constraints", async () => {
    await expect(db.query("update user_preferences set group_size_pref = 'huge' where user_id = $1", [A])).rejects.toThrow(/check/);
    await expect(db.query("update user_preferences set travel_radius_km = 30 where user_id = $1", [A])).rejects.toThrow(/check/);
    await expect(
      db.query("update user_preferences set budget_min_cents = 3000, budget_max_cents = 1000 where user_id = $1", [A]),
    ).rejects.toThrow(/check/);
    await expect(db.query("insert into agent_conversations (user_id, kind) values ($1, 'other')", [A])).rejects.toThrow(/check/);
  });

  it("bumps updated_at on update", async () => {
    const [before] = await rows("select updated_at from user_preferences where user_id = $1", [A]);
    await new Promise((r) => setTimeout(r, 5));
    await db.query("update user_preferences set interests = '{pottery,coffee}' where user_id = $1", [A]);
    const [after] = await rows("select updated_at from user_preferences where user_id = $1", [A]);
    expect((after.updated_at as Date).getTime()).toBeGreaterThan((before.updated_at as Date).getTime());
  });

  it("cascades deletes from the auth user", async () => {
    await db.query("delete from auth.users where id = $1", [A]);
    for (const t of ["user_preferences", "agent_profiles", "agent_conversations"]) {
      expect(await rows(`select 1 from ${t} where user_id = $1`, [A])).toEqual([]);
    }
    expect(await rows("select 1 from agent_messages")).toEqual([]);
  });
});
