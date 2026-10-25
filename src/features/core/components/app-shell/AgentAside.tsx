import { Bot } from 'lucide-react';
import Link from 'next/link';
import { AiRing } from '../ui/AiRing';
import { AiTag } from '../ui/AiTag';
import { Card } from '../ui/Card';

/** Default right-rail content: the user's agent strip, linking to the agent (02). Pages with their own rail override `@aside`. */
export function AgentAside({ displayName }: { displayName: string }) {
  return (
    <Card className="mx-2">
      <div className="flex items-center gap-3">
        <AiRing>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-pill text-brand">
            <Bot size={20} strokeWidth={1.75} aria-hidden />
          </span>
        </AiRing>
        <div className="min-w-0">
          <p className="truncate font-semibold">Your agent</p>
          <p className="text-[length:var(--text-sm)] text-text-2">Working for {displayName}</p>
        </div>
      </div>
      <p className="mt-3 text-[length:var(--text-sm)] text-text-2">Ask me for people, events or groups that fit your week.</p>
      <Link href="/agent" className="mt-2 inline-block text-[length:var(--text-sm)] font-semibold text-brand hover:underline">
        Chat with your agent
      </Link>
      <AiTag className="mt-3" />
    </Card>
  );
}
