import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/util/cn';

/**
 * OWNED BY WORKSTREAM 01. **The one AI marker** (design-system.md section 4): a pill with a
 * 2px gradient border, soft gradient fill and `--color-ai-ink` text. Nothing else in the
 * product may use the AI gradient.
 */

export type AiTagLabel = 'AI suggestion' | 'AI inferred' | 'Estimate';

export function AiTag({ label = 'AI suggestion', className }: { label?: AiTagLabel; className?: string }) {
  return (
    <span
      className={cn(
        'ai-tag inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-semibold',
        className,
      )}
    >
      <Sparkles aria-hidden size={12} strokeWidth={1.75} />
      {label}
    </span>
  );
}

/** A 2px gradient ring marking content an agent produced. */
export function AiRing({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('ai-ring rounded-md p-[2px]', className)}>{children}</div>;
}
