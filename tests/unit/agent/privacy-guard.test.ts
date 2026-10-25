import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Spec 12 risk mitigation: only features/agent may query the agent's private
 * tables; everyone else goes through getSharablePreferences(). README invariant 2:
 * nothing outside this feature reads agent_messages.
 */
const PRIVATE_TABLES = ["user_preferences", "agent_profiles", "agent_conversations", "agent_messages"];
const ALLOWED = [path.join("src", "features", "agent")];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe("privacy guard", () => {
  it("no code outside features/agent queries the agent's private tables", () => {
    const pattern = new RegExp(`\\.from\\(\\s*["'\`](${PRIVATE_TABLES.join("|")})["'\`]`);
    const offenders = files("src")
      .filter((f) => !ALLOWED.some((a) => f.startsWith(a)))
      .filter((f) => pattern.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("agent_messages is only read by the repo module", () => {
    const offenders = files(path.join("src", "features", "agent"))
      .filter((f) => !f.endsWith(path.join("server", "repo.ts")))
      .filter((f) => /from\(\s*["'`]agent_messages/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
