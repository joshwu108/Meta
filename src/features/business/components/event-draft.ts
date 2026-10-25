import type { EventCategory } from '@/shared/enums';

/**
 * The editable shape of an event and the two money conversions around it.
 *
 * Plain TypeScript on purpose: `decision/decision.ts` builds the Scene 4 payload from these
 * and is unit-tested in a Node environment, so they must not pull a component — and with it
 * the whole UI barrel and its JSX — into the test graph.
 */
export type EventDraft = {
  title: string;
  description: string;
  category: EventCategory;
  format: string;
  startsAtLocal: string;
  endsAtLocal: string;
  capacity: number;
  priceDollars: string;
};

/** An empty price field means free or pay at the venue, which is not the same as $0. */
export const priceToCents = (dollars: string): number | null => {
  const trimmed = dollars.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
};

export const centsToPrice = (cents: number | null): string =>
  cents === null ? '' : String(cents / 100);
