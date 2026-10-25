import 'server-only';
import { notify } from '@/features/core';
import { log } from '@/lib/log';
import type { NotificationType } from '@/shared/enums';

/** Map with at most `limit` promises in flight; results keep the input order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index]!, index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return results;
}

/** Split into chunks of `size` (keeps PostgREST `in.(...)` filters well under URL limits). */
/** Ids per PostgREST `in.(...)` filter: the gateway answers 414 above about 200 uuids in one request line. */
export const ID_FILTER_BATCH = 100;

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Best-effort notification: the social action it reports has already been committed, so a
 * failed insert is logged instead of turning a successful request into an error.
 */
export async function notifySafely(userId: string, type: NotificationType, payload: Record<string, unknown>): Promise<void> {
  try {
    await notify(userId, type, payload);
  } catch (error) {
    log.warn('social.notify_failed', { userId, type, error });
  }
}
