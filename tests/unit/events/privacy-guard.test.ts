import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Mirrors ws/02-agent's privacy guard for 06's code: only 02 may query its private tables.
const TABLES = String.raw`\.from\(\s*["'\`](user_preferences|agent_profiles|agent_conversations|agent_messages)["'\`]`;
const readsPrivate = (source: string) => new RegExp(TABLES).test(source);
const privateReads = (source: string) => [...source.matchAll(new RegExp(TABLES, "g"))].map((m) => m[1]);
const STUB = path.join("src", "features", "events", "server", "stubs", "agent.ts");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe("06 privacy guard", () => {
  it("never queries 02's private tables: preferences come from 02's getSharablePreferences", () => {
    const sources = [...files(path.join("src", "features", "events")), ...files(path.join("src", "app"))];
    const offenders = sources.filter((f) => readsPrivate(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
    expect(privateReads(readFileSync(STUB, "utf8"))).toEqual([]);
  });
});
