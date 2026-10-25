import type { GraphStats } from '../server/types';

/** What the shapes mean, and what the drawing had to leave out. */
export function GraphLegend({
  stats,
  drawn,
  total,
}: {
  stats: GraphStats;
  /** Nodes the canvas drew, against everything the snapshot holds. */
  drawn: number;
  total: number;
}) {
  const items = [
    {
      label: 'Connected',
      swatch: <span className="h-3 w-3 rounded-pill border-2 border-brand bg-brand-soft" />,
    },
    {
      label: 'Forming',
      swatch: (
        <span className="h-3 w-3 rounded-pill border-2 border-dashed border-text-3 bg-surface" />
      ),
    },
    {
      label: 'Suggested by your agent',
      swatch: <span className="ai-gradient-border h-3 w-3 rounded-pill" />,
    },
    {
      label: 'Groups & events',
      swatch: <span className="h-3 w-3 rounded-pill border-2 border-divider bg-brand-soft" />,
    },
  ];
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-[length:var(--text-xs)] text-text-2">
        {items.map((item) => (
          <li key={item.label} className="inline-flex items-center gap-1.5">
            {item.swatch}
            {item.label}
          </li>
        ))}
      </ul>
      {(drawn < total || stats.hidden > 0) && (
        <p className="text-[length:var(--text-xs)] text-text-3">
          Drawing your closest {drawn} of {total}
          {stats.hidden > 0 ? `, and ${stats.hidden} more aren’t in the graph` : ''}. The List view
          has everyone.
        </p>
      )}
    </div>
  );
}
