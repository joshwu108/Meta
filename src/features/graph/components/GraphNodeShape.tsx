'use client';
import type { KeyboardEvent } from 'react';
import type { NodePosition } from '../layout';
import type { GraphNode } from '../server/types';
import { NODE_STATE_LABELS } from '../labels';

/**
 * One node: a circle holding the person's profile picture, or a head silhouette when they have
 * none, with their name underneath. Groups and events get a glyph instead of a face.
 */

export type GraphNodeShapeProps = {
  node: GraphNode;
  at: NodePosition;
  isSelected: boolean;
  onSelect: (node: GraphNode) => void;
};

/** Labels are drawn, not laid out, so there is no ellipsis to fall back on. */
const MAX_LABEL = 12;
const clip = (label: string) =>
  label.length > MAX_LABEL ? `${label.slice(0, MAX_LABEL - 1)}…` : label;

/** A valid, unique id for this node's clip path. */
const clipId = (id: string) => `graph-clip-${id.replace(/[^a-zA-Z0-9]/g, '-')}`;

/** Ring colour per state. Suggested nodes carry the AI gradient, the one AI marker we use. */
function ring(node: GraphNode): { stroke: string; width: number; dash?: string; pulse?: boolean } {
  if (node.kind === 'me') return { stroke: 'var(--color-brand)', width: 3 };
  if (node.state === 'suggested') return { stroke: 'url(#graph-ai)', width: 3, dash: '5 4' };
  if (node.state === 'forming')
    return { stroke: 'var(--color-text-3)', width: 2, dash: '5 4', pulse: true };
  if (node.state === 'connected') return { stroke: 'var(--color-brand)', width: 2.5 };
  if (node.kind === 'more') return { stroke: 'var(--color-border-subtle)', width: 2, dash: '3 3' };
  return { stroke: 'var(--color-divider)', width: 2 };
}

/** Person silhouette, sized to the node. Shown whenever there is no picture to show. */
function HeadGlyph({ r, tone }: { r: number; tone: string }) {
  const scale = r / 16;
  return (
    <g transform={`scale(${scale})`} fill={tone} aria-hidden>
      <circle cx={0} cy={-4.2} r={4.4} />
      <path d="M -8.2 8.6 C -8.2 2.6 -4.4 0.4 0 0.4 C 4.4 0.4 8.2 2.6 8.2 8.6 Z" />
    </g>
  );
}

function Pictogram({ node, r }: { node: GraphNode; r: number }) {
  const tone = node.kind === 'me' ? 'var(--color-text-on-brand)' : 'var(--color-brand)';
  if (node.kind === 'group') {
    return (
      <g fill={tone} aria-hidden transform={`scale(${r / 16})`}>
        <circle cx={-4.6} cy={-3.4} r={3.4} />
        <circle cx={4.6} cy={-3.4} r={3.4} />
        <path d="M -11 7.6 C -11 2.6 -8 0.9 -4.6 0.9 C -1.2 0.9 1.8 2.6 1.8 7.6 Z" />
        <path d="M -1.8 7.6 C -1.8 2.6 1.2 0.9 4.6 0.9 C 8 0.9 11 2.6 11 7.6 Z" />
      </g>
    );
  }
  if (node.kind === 'event') {
    return (
      <g aria-hidden transform={`scale(${r / 16})`} fill="none" stroke={tone} strokeWidth={1.8}>
        <rect x={-7.5} y={-6} width={15} height={13} rx={2.5} />
        <path d="M -7.5 -1.5 H 7.5" />
        <path d="M -3.5 -6 V -8.5 M 3.5 -6 V -8.5" strokeLinecap="round" />
      </g>
    );
  }
  if (node.kind === 'more') {
    return (
      <text
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-text-2 text-[11px] font-semibold"
      >
        {node.count ? `+${node.count}` : '+'}
      </text>
    );
  }
  return <HeadGlyph r={r} tone={tone} />;
}

export function GraphNodeShape({ node, at, isSelected, onSelect }: GraphNodeShapeProps) {
  const style = ring(node);
  const inner = at.r - style.width / 2 - 1;
  // The viewBox scales down on small screens, so the tap target is widened in viewBox units to
  // stay near 44 CSS px wherever the canvas is drawn.
  const hit = Math.max(at.r + 10, 26);
  const describe = [NODE_STATE_LABELS[node.state], node.label, node.subtitle]
    .filter(Boolean)
    .join(', ');
  const onKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(node);
    }
  };

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={describe}
      onClick={() => onSelect(node)}
      onKeyDown={onKeyDown}
      transform={`translate(${at.x} ${at.y})`}
      className="cursor-pointer outline-none [&:focus-visible>.node-ring]:stroke-brand-hover"
    >
      <circle r={hit} fill="transparent" />
      {isSelected && (
        <circle
          r={at.r + 6}
          fill="none"
          stroke="var(--color-brand)"
          strokeWidth={1.5}
          opacity={0.5}
        />
      )}
      <circle
        className={style.pulse ? 'node-ring graph-pulse' : 'node-ring'}
        r={at.r}
        fill={node.kind === 'me' ? 'var(--color-brand)' : 'var(--color-brand-soft)'}
        stroke={style.stroke}
        strokeWidth={style.width}
        strokeDasharray={style.dash}
      />
      {node.avatarUrl ? (
        <>
          <clipPath id={clipId(node.id)}>
            <circle r={inner} />
          </clipPath>
          <image
            href={node.avatarUrl}
            x={-inner}
            y={-inner}
            width={inner * 2}
            height={inner * 2}
            clipPath={`url(#${clipId(node.id)})`}
            preserveAspectRatio="xMidYMid slice"
          />
        </>
      ) : (
        <Pictogram node={node} r={inner} />
      )}
      {/* A canvas-coloured outline under the glyphs keeps a name readable where an edge runs
          behind it, without a box that would clutter the drawing. */}
      <text
        x={at.labelX - at.x}
        y={at.labelY - at.y}
        textAnchor="middle"
        dominantBaseline="central"
        stroke="var(--color-canvas)"
        strokeWidth={3.5}
        style={{ paintOrder: 'stroke' }}
        className="pointer-events-none fill-text-2 text-[14px] font-semibold"
      >
        {clip(node.label)}
      </text>
    </g>
  );
}
