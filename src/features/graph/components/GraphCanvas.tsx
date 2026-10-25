'use client';
import { useEffect, useMemo, useRef } from 'react';
import { GRAPH_VIEWBOX, layoutGraph } from '../layout';
import type { GraphNode, GraphSnapshot } from '../server/types';
import { GraphNodeShape } from './GraphNodeShape';

/**
 * The graph itself: an SVG whose coordinates are viewBox units, so it scales to its column with
 * no DOM measurement. Edges are drawn first, nodes over them.
 */

export type GraphCanvasProps = {
  snapshot: GraphSnapshot;
  selectedId: string | null;
  onSelect: (node: GraphNode) => void;
  /** Told how many nodes made it onto the canvas, so the legend can say what it left out. */
  onDrawn?: (count: number) => void;
};

type EdgeStyle = { stroke: string; width: number; dash?: string; opacity: number; pulse?: boolean };

function edgeStyle(state: GraphSnapshot['edges'][number]['state'], strength: number): EdgeStyle {
  if (state === 'connected')
    return { stroke: 'var(--color-brand)', width: 1 + 2.5 * strength, opacity: 0.45 };
  if (state === 'forming')
    return { stroke: 'var(--color-text-3)', width: 1.5, dash: '5 5', opacity: 0.9, pulse: true };
  if (state === 'suggested')
    return { stroke: 'url(#graph-ai)', width: 2, dash: '3 6', opacity: 0.9 };
  return { stroke: 'var(--color-divider)', width: 1, opacity: 0.8 };
}

export function GraphCanvas({ snapshot, selectedId, onSelect, onDrawn }: GraphCanvasProps) {
  const layout = useMemo(() => layoutGraph(snapshot), [snapshot]);
  useEffect(() => onDrawn?.(layout.positions.size), [layout, onDrawn]);

  // On a narrow screen the canvas is wider than the column and the container scrolls. Start it
  // in the middle, or the first thing a phone shows is the empty left edge of the drawing.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = scroller.current;
    if (element) element.scrollLeft = (element.scrollWidth - element.clientWidth) / 2;
  }, []);
  const { stats } = snapshot;
  const summary = `Your graph: ${stats.connected} connected, ${stats.forming} forming, ${stats.suggested} suggested, ${stats.groups} groups, ${stats.events} events.`;

  return (
    // Below ~640px the canvas keeps its size and the container scrolls, so nodes stay large
    // enough to read and to tap instead of shrinking with the viewport.
    <div ref={scroller} className="-mx-4 overflow-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0">
      <svg
        viewBox={`0 0 ${GRAPH_VIEWBOX} ${GRAPH_VIEWBOX}`}
        role="img"
        aria-label={summary}
        className="h-[620px] w-[620px] max-w-none sm:h-auto sm:w-full"
      >
        <defs>
          {/* Same stops as --gradient-ai, the marker reserved for AI-generated content. */}
          <linearGradient id="graph-ai" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0866ff" />
            <stop offset="45%" stopColor="#6a5cff" />
            <stop offset="75%" stopColor="#d946ef" />
            <stop offset="100%" stopColor="#ff6b6b" />
          </linearGradient>
        </defs>
        <g>
          {snapshot.edges.map((edge) => {
            const from = layout.positions.get(edge.source);
            const to = layout.positions.get(edge.target);
            if (!from || !to) return null;
            const style = edgeStyle(edge.state, edge.strength);
            return (
              <line
                key={edge.id}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={style.stroke}
                strokeWidth={style.width}
                strokeDasharray={style.dash}
                opacity={style.opacity}
                className={style.pulse ? 'graph-pulse' : undefined}
              />
            );
          })}
        </g>
        <g>
          {snapshot.nodes.map((node) => {
            const at = layout.positions.get(node.id);
            if (!at) return null;
            return (
              <GraphNodeShape
                key={node.id}
                node={node}
                at={at}
                isSelected={selectedId === node.id}
                onSelect={onSelect}
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
}
