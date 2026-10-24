import { Sparkles } from 'lucide-react';
import { cn } from './cn';

export type AiTagLabel = 'AI suggestion' | 'AI inferred' | 'Estimate';

/**
 * The one AI marker. Gradient 2px border via background-clip, soft gradient fill, ai-ink text.
 * Use on anything the AI produced: inferred chips, match explanations, proposals, recommendations.
 */
export function AiTag({ label = 'AI suggestion', className }: { label?: AiTagLabel; className?: string }) {
  return (
    <span
      className={cn(
        'ai-gradient-border inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-pill px-2 text-[length:var(--text-xs)] font-bold',
        'text-ai-ink',
        className,
      )}
    >
      <Sparkles size={12} strokeWidth={2} aria-hidden />
      {label}
    </span>
  );
}
