import type { ReactNode } from 'react';

/** OWNED BY WORKSTREAM 01. Icon + one line + one action. */
export function EmptyState({
  icon,
  children,
  action,
}: {
  icon?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md bg-surface-2 px-4 py-10 text-center">
      {icon ? <span className="text-text-3">{icon}</span> : null}
      <p className="max-w-sm text-sm text-text-2">{children}</p>
      {action}
    </div>
  );
}
