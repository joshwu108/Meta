import Link from 'next/link';
import { Bot } from 'lucide-react';
import { AiRing } from '../ui/AiRing';
import { AiTag } from '../ui/AiTag';
import { Card } from '../ui/Card';

/**
 * Default right-rail content: the user's agent strip. The consumer layout only renders for
 * onboarded users, so the agent already knows their interests; point them at it.
 */
export function AgentAside({ displayName }: { displayName: string }) {
  return (
    <Card className="mx-2">
      <div className="flex items-center gap-3">
        <AiRing>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-pill text-brand-ink">
            <Bot size={20} strokeWidth={1.75} aria-hidden />
          </span>
        </AiRing>
        <div className="min-w-0">
          <p className="truncate font-semibold">Your agent</p>
          <p className="text-[length:var(--text-sm)] text-text-2">Working for {displayName}</p>
        </div>
      </div>
      <p className="mt-3 text-[length:var(--text-sm)] text-text-2">Knows your interests and free evenings. Ask it to change them, or see what it has shared.</p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <Link href="/agent" className="text-[length:var(--text-sm)] font-semibold">Open your agent</Link>
        <AiTag />
      </div>
    </Card>
  );
}
