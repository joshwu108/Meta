'use client';
import Link from 'next/link';
import { AiTag, Avatar, Button, Sheet } from '@/features/core/components/ui';
import { EDGE_STATE_LABELS, NODE_STATE_LABELS } from '../labels';
import type { GraphEdge, GraphNode, GraphSnapshot } from '../server/types';

/** How this node reached the viewer: every edge that touches it, with its "why". */
function reasons(snapshot: GraphSnapshot, node: GraphNode): GraphEdge[] {
  return snapshot.edges.filter((edge) => edge.source === node.id || edge.target === node.id);
}

const labelOf = (snapshot: GraphSnapshot, id: string) =>
  snapshot.nodes.find((candidate) => candidate.id === id)?.label ?? 'Someone';

export function NodeDetailSheet({
  snapshot,
  node,
  onClose,
}: {
  snapshot: GraphSnapshot;
  node: GraphNode | null;
  onClose: () => void;
}) {
  if (!node) return null;
  const edges = reasons(snapshot, node);
  const actionLabel =
    node.kind === 'group' ? 'Open group' : node.kind === 'event' ? 'Open event' : 'View in Match';

  return (
    <Sheet isOpen onClose={onClose} title={node.label}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          {node.kind === 'person' || node.kind === 'me' ? (
            <Avatar name={node.label} src={node.avatarUrl} size={56} />
          ) : null}
          <div>
            <p className="font-semibold">{NODE_STATE_LABELS[node.state]}</p>
            {node.subtitle && (
              <p className="text-[length:var(--text-sm)] text-text-2">{node.subtitle}</p>
            )}
          </div>
          {node.agent && <AiTag label="AI suggestion" />}
        </div>

        <section className="flex flex-col gap-2">
          <h3 className="text-[length:var(--text-sm)] text-text-2">How you’re connected</h3>
          <ul className="flex flex-col gap-2">
            {edges.map((edge) => {
              const otherId = edge.source === node.id ? edge.target : edge.source;
              return (
                <li key={edge.id} className="surface-card p-3 text-[length:var(--text-sm)]">
                  <p className="font-semibold">{edge.why ?? EDGE_STATE_LABELS[edge.state]}</p>
                  {otherId !== snapshot.me && (
                    <p className="text-text-2">via {labelOf(snapshot, otherId)}</p>
                  )}
                </li>
              );
            })}
            {edges.length === 0 && <li className="text-text-2">No link recorded yet.</li>}
          </ul>
        </section>

        {node.href && (
          <Link href={node.href} className="no-underline hover:no-underline">
            <Button>{actionLabel}</Button>
          </Link>
        )}
      </div>
    </Sheet>
  );
}
