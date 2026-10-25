import 'server-only';
import { getMatchesForViewer } from './matches';
import { MATCH_LIMITS } from './weights';

/** Compact person card for other surfaces (06's Discover rail, 02's agent suggestions). */
export type SuggestedPerson = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  neighborhood: string | null;
  explanation: string;
  score: number;
  sharedInterests: string[];
};

/**
 * Top matches for a user. Reuses the `/match` list (and its 5-minute cache), so Discover and the
 * Match page always agree. Empty when the user has not consented to matching.
 */
export async function getSuggestedPeople(userId: string, limit = 3): Promise<SuggestedPerson[]> {
  const { matches } = await getMatchesForViewer(userId, { limit: MATCH_LIMITS.defaultLimit });
  return matches.slice(0, Math.max(0, limit)).map((match) => ({
    userId: match.user.id,
    displayName: match.user.displayName,
    avatarUrl: match.user.avatarUrl,
    neighborhood: match.user.neighborhood,
    explanation: match.explanation,
    score: match.score,
    sharedInterests: match.sharedInterests,
  }));
}
