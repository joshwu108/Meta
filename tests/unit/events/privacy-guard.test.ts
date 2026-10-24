import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Mirrors ws/02-agent's privacy guard for 06's code: only 02 may query its private tables.
// The single exception is the getSharablePreferences stand-in, replaced by 02's export on merge.
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
  it("never queries 02's private tables outside the getSharablePreferences stand-in", () => {
    const sources = [...files(path.join("src", "features", "events")), ...files(path.join("src", "app"))];
    const offenders = sources.filter((f) => f !== STUB && readsPrivate(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("limits the stand-in to the two reads getSharablePreferences needs", () => {
    const source = readFileSync(STUB, "utf8");
    expect(privateReads(source)).toEqual(["user_preferences", "agent_profiles"]);
    const body = source.slice(source.indexOf("export async function getSharablePreferences"), source.indexOf("/** 02's ExplainInput"));
    expect(privateReads(body)).toHaveLength(2);
  });
});
