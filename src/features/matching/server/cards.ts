import 'server-only';
import { ApiError } from '@/lib/api/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { chunk, ID_FILTER_BATCH } from './async';

/** The public part of a profile (same columns as `profile_public_cards`). */
export type PublicCard = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  neighborhood: string | null;
};

/**
 * Public cards for users the caller is already allowed to see (match candidates, connection
 * counterparts, group rosters). Read with the service role so non-discoverable members of a
 * shared group still render, but only the public-card columns ever leave this function.
 */
export async function getPublicCards(userIds: readonly string[]): Promise<Map<string, PublicCard>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const admin = createAdminClient();
  const reads = await Promise.all(
    chunk(ids, ID_FILTER_BATCH).map((batch) => admin.from('profiles').select('id, display_name, avatar_url, bio, neighborhood').in('id', batch)),
  );
  if (reads.some((read) => read.error)) throw new ApiError('INTERNAL', 'Could not load profiles', 500);
  return new Map(
    reads.flatMap((read) => read.data ?? []).map((row) => [
      row.id,
      { id: row.id, displayName: row.display_name, avatarUrl: row.avatar_url, bio: row.bio, neighborhood: row.neighborhood },
    ]),
  );
}

/** Card for one user, or null when the profile does not exist. */
export async function getPublicCard(userId: string): Promise<PublicCard | null> {
  return (await getPublicCards([userId])).get(userId) ?? null;
}

/** Placeholder used when a profile disappeared between two reads. */
export function unknownCard(userId: string): PublicCard {
  return { id: userId, displayName: 'Weave member', avatarUrl: null, bio: null, neighborhood: null };
}
