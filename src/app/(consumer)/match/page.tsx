import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/features/core';
import { getMatchesForViewer, listConnections, type MatchCard } from '@/features/matching';
import { MatchScreen } from '@/features/matching/components/MatchScreen';
import { createServerClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/shared/schemas/common';
import { matchesQuerySchema, type MatchesQuery } from '@/shared/schemas/social';

export const metadata = { title: 'Match' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const MAX_FILTER_CHIPS = 6;

/** Most common shared interests across the unfiltered list, for the filter chips. */
function interestOptions(matches: readonly MatchCard[]): string[] {
  const counts = new Map<string, number>();
  for (const match of matches) for (const value of match.sharedInterests) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_FILTER_CHIPS)
    .map(([value]) => value);
}

/** Screen 3: recommended people with explanations, plus incoming and outgoing requests. */
export default async function MatchPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const params = await searchParams;
  const parsed = matchesQuerySchema.safeParse({ interest: first(params.interest), goal: first(params.goal) });
  const query: MatchesQuery = parsed.success ? parsed.data : { limit: 20 };
  const isFiltered = Boolean(query.interest || query.goal);
  const supabase = await createServerClient();
  const [result, unfiltered, connections] = await Promise.all([
    getMatchesForViewer(user.id, query),
    isFiltered ? getMatchesForViewer(user.id, { limit: 20 }) : Promise.resolve(null),
    listConnections({ userId: user.id, supabase }),
  ]);
  const pending = connections.filter((item) => item.status === 'pending');
  return (
    <MatchScreen
      status={result.status}
      matches={result.matches}
      incoming={pending.filter((item) => item.direction === 'incoming')}
      outgoing={pending.filter((item) => item.direction === 'outgoing')}
      connected={connections.filter((item) => item.status === 'accepted')}
      filters={{ interest: query.interest, goal: query.goal, interestOptions: interestOptions((unfiltered ?? result).matches) }}
      focusId={uuidSchema.safeParse(first(params.focus)).data}
    />
  );
}
