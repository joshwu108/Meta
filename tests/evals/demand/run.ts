/**
 * Live prompt eval for `demand.generate_proposal` (spec §9). Needs ANTHROPIC_API_KEY and MOCK_AI unset:
 *   pnpm tsx --conditions=react-server tests/evals/demand/run.ts
 * Prints each draft for the human check that no text implies confirmation, and exits 1 below 4/5.
 */
import { generateStructured } from '@/lib/ai';
import { ProposalDocument } from '@/features/demand/schemas';
import { DEMAND_CONFIG } from '@/features/demand/server/config';
import { validateProposal } from '@/features/demand/server/validate';
import { capabilitySummary } from '@/features/demand/server/venue';
import { EVAL_CASES } from './cases';

const print = (text: string): void => {
  process.stdout.write(`${text}\n`);
};

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY || process.env.MOCK_AI === '1') {
    console.error('Set ANTHROPIC_API_KEY and unset MOCK_AI to run the live eval.');
    process.exit(2);
  }
  let passed = 0;
  for (const c of EVAL_CASES) {
    const input = { brief: c.brief, business: c.venue.card, capabilities: capabilitySummary(c.venue) };
    const raw = await generateStructured({ prompt: 'demand.generate_proposal', input, schema: ProposalDocument, maxRetries: 0 });
    const result = validateProposal(ProposalDocument.parse(raw), c.cluster, c.venue, new Date(), DEMAND_CONFIG);
    if (result.ok) passed += 1;
    print(`\n## ${c.name}: ${result.ok ? 'PASS' : `FAIL (${result.issues.join(', ')})`}`);
    print(`${raw.title}\n${raw.description}\nWhy: ${raw.whySuggested}`);
  }
  print(`\n${passed}/${EVAL_CASES.length} passed the validator on the first try (target ≥ 4).`);
  process.exit(passed >= 4 ? 0 : 1);
}

void main();
