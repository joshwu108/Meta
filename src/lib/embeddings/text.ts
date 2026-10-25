import { createHash } from 'node:crypto';

/**
 * The text a profile is embedded from. Deterministic: the same preferences always produce the
 * same string, so `sourceHash` can tell a backfill which rows actually need re-embedding.
 */
export type EmbeddableProfile = {
  interests: readonly string[];
  interestCategories: readonly string[];
  socialGoals?: readonly string[];
  activityPrefs?: readonly string[];
  /** Free text the user wrote; carries signal the tag list cannot. */
  bio?: string | null;
};

const list = (values: readonly string[] | undefined): string =>
  [...new Set(values ?? [])]
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
    .sort()
    .join(', ');

/**
 * A short natural-language description rather than a bag of tags: sentence-transformers were
 * trained on prose, and "Interested in pottery and ceramics." embeds closer to its neighbours
 * than "pottery,ceramics" does. Sorted everywhere so field order cannot change the vector.
 */
export function profileText(profile: EmbeddableProfile): string {
  const parts: string[] = [];
  const interests = list(profile.interests);
  if (interests) parts.push(`Interested in ${interests}.`);
  const categories = list(profile.interestCategories);
  if (categories) parts.push(`Enjoys ${categories.replace(/_/g, ' ')} activities.`);
  const goals = list(profile.socialGoals);
  if (goals) parts.push(`Hoping to ${goals.replace(/_/g, ' ')}.`);
  const prefs = list(profile.activityPrefs);
  if (prefs) parts.push(`Prefers ${prefs} settings.`);
  const bio = profile.bio?.trim();
  if (bio) parts.push(bio);
  return parts.join(' ');
}

/** Short text for one interest tag. "board-games" embeds poorly; "board games" does not. */
export function tagText(tag: string): string {
  return tag.trim().toLowerCase().replace(/[-_]+/g, ' ');
}

/** Stable fingerprint of the embedded text, so unchanged rows are skipped on a backfill. */
export function sourceHash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 32);
}
