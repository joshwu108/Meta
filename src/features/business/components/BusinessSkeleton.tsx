/**
 * Content-area placeholder for the business routes. Workstream 01's `AppShell` supplies the
 * frame, so this only stands in for the column inside it.
 */

const Bar = ({ className }: { className: string }) => (
  <div className={`animate-pulse rounded-sm bg-pressed ${className}`} />
);

export function BusinessSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <Bar className="h-7 w-56" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="rounded-md bg-surface p-4 shadow-1">
            <Bar className="h-3 w-24" />
            <Bar className="mt-2 h-6 w-12" />
          </div>
        ))}
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="rounded-md bg-surface p-4 shadow-1">
          <Bar className="h-4 w-28" />
          <Bar className="mt-3 h-5 w-3/4" />
          <Bar className="mt-2 h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}
