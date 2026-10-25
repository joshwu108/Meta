import { Card } from '@/features/core/components/ui';

/** The hero stat row on the dashboard (spec section 7, Screen 2). */
export function StatRow({
  items,
}: {
  items: readonly { label: string; value: number; hint?: string }[];
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <Card key={item.label} className="flex flex-col gap-1">
          <span className="text-sm text-text-2">{item.label}</span>
          <span className="text-xl font-bold tabular-nums leading-tight">{item.value}</span>
          {item.hint ? <span className="text-xs text-text-3">{item.hint}</span> : null}
        </Card>
      ))}
    </div>
  );
}
