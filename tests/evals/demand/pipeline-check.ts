/**
 * Runs the demand pipeline against the live local Supabase and reports what it produced.
 * Verifies the scale seed actually yields clusters and proposals.
 *   pnpm tsx --conditions=react-server tests/evals/demand/pipeline-check.ts [--dry]
 * `--dry` forces MOCK_AI so no tokens are spent; omit it for a real Muse run.
 */
import { config } from 'dotenv';
import { supabaseDeps } from '../../../src/features/demand/server/wiring';
import { runPipeline } from '../../../src/features/demand/server/pipeline';

config({ path: '.env.local', quiet: true });

const dry = process.argv.includes('--dry');
if (dry) process.env.MOCK_AI = '1';

async function main(): Promise<number> {
  console.log(`mode: ${dry ? 'dry (MOCK_AI=1)' : `live (provider=${process.env.AI_PROVIDER})`}`);
  try {
    const result = await runPipeline(supabaseDeps(), { triggeredBy: 'manual', dryRun: dry });
    console.log(JSON.stringify(result, null, 2));
    return 0;
  } catch (error) {
    console.error(`pipeline failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

main().then((code) => process.exit(code));
