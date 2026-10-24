import type { LucideIcon } from 'lucide-react';
import { EmptyState } from './ui/EmptyState';

/** Stand-in for screens owned by other workstreams. Keeps every nav target reachable. */
export function PlaceholderPage({ title, owner, icon: Icon, lead }: { title: string; owner: string; icon: LucideIcon; lead: string }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lead">{title}</h1>
      <p className="text-text-2">{lead}</p>
      <section className="surface-card">
        <EmptyState icon={<Icon size={22} strokeWidth={1.75} aria-hidden />} title={`This screen is being built by the ${owner} workstream.`} />
      </section>
    </div>
  );
}
