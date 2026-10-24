/**
 * The business frame's shape without its data, for the route-level loading state. Mirrors
 * BusinessShell's dimensions (56px top bar, 240px rail from 768px, 960px centre column) so
 * nothing jumps when the real page arrives.
 */

const Bar = ({ className }: { className: string }) => (
  <div className={`animate-pulse rounded-sm bg-pressed ${className}`} />
);

export function BusinessSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="min-h-dvh bg-canvas" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>

      <header className="flex h-14 items-center gap-4 border-b border-border-subtle bg-surface px-4">
        <span className="text-md font-bold tracking-tight">CommonGround</span>
        <Bar className="ml-auto h-4 w-32" />
      </header>

      <div className="mx-auto flex w-full max-w-[1280px] gap-6 px-4 py-6">
        <div className="hidden w-60 shrink-0 flex-col gap-2 md:flex">
          {Array.from({ length: 4 }, (_, index) => (
            <Bar key={index} className="h-10 w-full" />
          ))}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-5 md:max-w-[960px]">
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
      </div>
    </div>
  );
}
