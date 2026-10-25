import { uuidSchema } from '@/shared/schemas/common';

/**
 * Whether an id from a URL is even shaped like a row key.
 *
 * Postgres rejects a malformed uuid with 22P02, which the store can only report as an
 * internal failure — so `/business/events/not-a-uuid/edit` rendered "This page could not
 * load" while every other unknown id correctly rendered "We could not find that". Ids are
 * checked for shape before any lookup, so a mistyped or truncated URL is simply not found.
 */
export function isLookupId(value: string): boolean {
  return uuidSchema.safeParse(value).success;
}
