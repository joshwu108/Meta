import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { EVAL_CASES } = await import('../../evals/demand/cases');
const { templateProposal } = await import('@/features/demand/server/generate');
const { validateProposal } = await import('@/features/demand/server/validate');
const { capabilitySummary } = await import('@/features/demand/server/venue');
const { DEMAND_CONFIG } = await import('@/features/demand/server/config');
const { NOW } = await import('./harness');

describe('demand prompt eval set', () => {
  it('has the 5 briefs the spec asks for, including traps', () => {
    expect(EVAL_CASES).toHaveLength(5);
    expect(EVAL_CASES.filter((c) => c.name.startsWith('trap-'))).toHaveLength(2);
  });

  it.each(EVAL_CASES.map((c) => [c.name, c] as const))('%s is consistent and the deterministic draft passes the validator', (_name, c) => {
    expect(c.venue.capabilities.eventCategories).toContain(c.brief.category);
    const draft = templateProposal({ brief: c.brief, business: c.venue.card, capabilities: capabilitySummary(c.venue) });
    const result = validateProposal(draft, c.cluster, c.venue, NOW, DEMAND_CONFIG);
    expect(result.ok ? [] : result.issues).toEqual([]);
  });
});
