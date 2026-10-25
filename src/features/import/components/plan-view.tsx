'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AiTag, Button, Card } from '@/features/core/components/ui';
import { ApiClientError, apiGet, apiPost } from '@/lib/api/client';
import type { PlanView as Plan } from '../schemas';

/** "Your plan": steps the user carries out themselves through existing flows. */
export function PlanView({ refresh = false }: { refresh?: boolean }) {
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Plan | null>(`/api/import/plan${refresh ? '?refresh=1' : ''}`)
      .then(setPlan)
      .catch((err) => setError(err instanceof ApiClientError ? err.message : 'Couldn’t load your plan.'));
  }, [refresh]);

  async function markDone(key: string) {
    try {
      setPlan(await apiPost<Plan>('/api/import/plan/done', { key }));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Couldn’t save that.');
    }
  }

  if (error) return <p role="alert" className="text-danger">{error}</p>;
  if (plan === undefined) return <p className="text-text-2" role="status">Putting together your plan…</p>;
  if (!plan || plan.cards.length === 0) {
    return <Card><p className="m-0">Nothing to plan yet. Add a few interests and check back.</p></Card>;
  }
  return (
    <section aria-labelledby="plan-title" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 id="plan-title" className="m-0">Your plan</h2>
        {plan.aiUsed ? <AiTag label="AI suggestion" /> : null}
      </div>
      <p className="m-0 text-text-2">Ideas only. Nothing is booked or sent until you tap through and do it yourself.</p>
      <ul role="list" className="grid gap-3 md:grid-cols-3">
        {plan.cards.map((card) => (
          <li key={card.title}>
            <Card className="flex h-full flex-col gap-2">
              <h3 className="m-0">{card.title}</h3>
              <p className="m-0 text-[length:var(--text-sm)] text-text-2">{card.why}</p>
              <ol className="mt-auto flex flex-col gap-2">
                {card.steps.map((step) => (
                  <li key={step.doneKey} className="flex flex-wrap items-center gap-2">
                    {step.done ? (
                      <span className="font-semibold text-success">✓ {step.label}</span>
                    ) : (
                      <Link className="font-semibold text-brand" href={step.href}>{step.label}</Link>
                    )}
                    {!step.done && ['open_place', 'create_group', 'invite_group'].includes(step.action) ? (
                      <Button variant="ghost" onClick={() => void markDone(step.doneKey)} aria-label={`Mark “${step.label}” done`}>Done</Button>
                    ) : null}
                  </li>
                ))}
              </ol>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
