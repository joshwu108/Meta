import Link from 'next/link';
import { Avatar } from '@/features/core/components/ui';
import { NODE_STATE_LABELS } from '../labels';
import type { GraphNode, GraphSnapshot } from '../server/types';

/**
 * The same graph as rows. Not a fallback: it is the keyboard and screen-reader path to every
 * node, and on a phone it is often the faster way to read the list.
 */

const SECTIONS: ReadonlyArray<{ state: GraphNode['state']; heading: string; hint: string }> = [
  { state: 'connected', heading: 'Connected', hint: 'People you’re connected with' },
  { state: 'forming', heading: 'Forming', hint: 'Requests waiting on an answer' },
  { state: 'suggested', heading: 'Suggested', hint: 'People your agent found' },
  { state: 'context', heading: 'Shared groups & events', hint: 'Where you overlap' },
];

function Row({ node }: { node: GraphNode }) {
  const body = (
    <span className="flex min-w-0 items-center gap-3">
      {node.kind === 'person' || node.kind === 'me' ? (
        <Avatar name={node.label} src={node.avatarUrl} size={32} />
      ) : (
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-brand-soft text-xs font-semibold text-brand">
          {node.kind === 'group' ? 'G' : node.kind === 'event' ? 'E' : '+'}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate font-semibold text-text">{node.label}</span>
        {node.subtitle && (
          <span className="block truncate text-[length:var(--text-xs)] text-text-2">
            {node.subtitle}
          </span>
        )}
      </span>
    </span>
  );
  return (
    <li className="surface-card flex items-center justify-between gap-3 p-3">
      {node.href ? (
        <Link href={node.href} className="min-w-0 flex-1 no-underline hover:no-underline">
          {body}
        </Link>
      ) : (
        <span className="min-w-0 flex-1">{body}</span>
      )}
      <span className="shrink-0 text-[length:var(--text-xs)] text-text-3">
        {NODE_STATE_LABELS[node.state]}
      </span>
    </li>
  );
}

export function GraphList({ snapshot }: { snapshot: GraphSnapshot }) {
  return (
    <div className="flex flex-col gap-4">
      {SECTIONS.map((section) => {
        const nodes = snapshot.nodes.filter((node) => node.state === section.state);
        if (nodes.length === 0) return null;
        return (
          <section key={section.state} className="flex flex-col gap-2">
            <h2 className="text-[length:var(--text-md)]">{section.heading}</h2>
            <p className="text-[length:var(--text-xs)] text-text-2">{section.hint}</p>
            <ul className="flex flex-col gap-2">
              {nodes.map((node) => (
                <Row key={node.id} node={node} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
