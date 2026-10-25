import type { RunStage } from '../schemas';

export const STAGE_STEPS: readonly { stage: RunStage; label: string }[] = [
  { stage: 'collecting', label: 'Collecting' },
  { stage: 'clustering', label: 'Clustering' },
  { stage: 'matching', label: 'Matching venues' },
  { stage: 'drafting', label: 'Drafting proposals' },
  { stage: 'done', label: 'Done' },
];

export type StepState = 'done' | 'current' | 'upcoming';

/** Tracker state per step. A completed run shows every step done. */
export function stepStates(stage: RunStage | null, status: 'running' | 'completed' | 'failed' | null): StepState[] {
  if (status === 'completed') return STAGE_STEPS.map(() => 'done');
  const current = stage ? STAGE_STEPS.findIndex((s) => s.stage === stage) : -1;
  return STAGE_STEPS.map((_, i) => (i < current ? 'done' : i === current ? 'current' : 'upcoming'));
}

const CATEGORY: Readonly<Record<string, string>> = {
  creative: 'Creative', food_drink: 'Food & drink', games: 'Games', outdoors: 'Outdoors',
  fitness: 'Fitness', learning: 'Learning', music: 'Music', community: 'Community',
};

const SLOT: Readonly<Record<string, string>> = {
  mon_eve: 'Mon evening', tue_eve: 'Tue evening', wed_eve: 'Wed evening', thu_eve: 'Thu evening', fri_eve: 'Fri evening',
  sat_day: 'Sat daytime', sat_eve: 'Sat evening', sun_day: 'Sun daytime', sun_eve: 'Sun evening',
};

export const categoryLabel = (c: string): string => CATEGORY[c] ?? c;
export const slotLabel = (s: string): string => SLOT[s] ?? s;
export const bandLabel = (b: string): string => `${b.replace('-', '–')} interested`;
