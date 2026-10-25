/**
 * Connectivity check for the Meta Llama API wiring. Reads .env.local, turns MOCK_AI off for this
 * process only, and drives the real `src/lib/ai` stack once:
 *   pnpm tsx --conditions=react-server tests/evals/llama/check.ts
 * Exits 0 when a live structured call succeeds, 1 with a diagnosis when it does not.
 */
import { config } from "dotenv";
import { z } from "zod";
import { resolveProvider } from "../../../src/lib/ai/providers";
import { generateStructured } from "../../../src/lib/ai";

config({ path: ".env.local", quiet: true });
process.env.MOCK_AI = "0";

const schema = z.object({ status: z.string(), source: z.string() });

/** Never print the key; just show enough to tell which credential is loaded. */
function fingerprint(key: string | undefined): string {
  if (!key) return "not set";
  const parts = key.split("|");
  return parts.length === 3 ? `LLM|${parts[1]}|…(${key.length} chars)` : `…(${key.length} chars, no "|" — check quoting)`;
}

async function main(): Promise<number> {
  for (const name of ["META_API_KEY", "LLAMA_API_KEY", "ANTHROPIC_API_KEY"] as const) {
    if (process.env[name]) console.log(`${name.padEnd(14)}: ${fingerprint(process.env[name])}`);
  }
  console.log(`AI_PROVIDER   : ${process.env.AI_PROVIDER || "(unset, auto-detect)"}`);
  console.log(`MOCK_AI       : ${process.env.MOCK_AI} (0 = live calls)`);

  let provider;
  try {
    provider = resolveProvider();
  } catch (error) {
    console.error(`\n✗ provider not resolvable: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
  console.log(`provider      : ${provider.id}`);
  console.log(`models        : smart=${provider.modelFor("smart")} fast=${provider.modelFor("fast")}`);

  try {
    const out = await generateStructured({
      prompt: "core.healthcheck",
      input: { ping: true },
      schema,
      model: "fast",
      maxRetries: 0,
    });
    console.log(`\n✓ live structured call succeeded: ${JSON.stringify(out)}`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const details = (error as { details?: unknown }).details;
    console.error(`\n✗ live call failed: ${message}`);
    if (details) console.error(`  details: ${JSON.stringify(details)}`);
    return 1;
  }
}

main().then((code) => process.exit(code));
