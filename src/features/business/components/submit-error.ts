import type { ErrorCode } from '@/lib/api/errors';

/**
 * Owner-facing wording for a failed mutation.
 *
 * Only VALIDATION text is written for the owner — it names the field and the venue's own
 * hours — so it is passed through. Everything else is written for a developer: publishing
 * the same draft from two tabs showed the second one "published -> published is not a legal
 * event transition", straight from the status machine.
 */
export function submitErrorMessage(code: ErrorCode, fallback: string): string {
  switch (code) {
    case 'VALIDATION':
      return fallback;
    case 'CONFLICT':
      return 'This has already changed somewhere else, so your change was not applied. Reload the page to see where it stands now.';
    case 'NOT_FOUND':
      return 'This is no longer here. It may have been removed in another tab.';
    case 'FORBIDDEN':
      return 'This venue does not have access to that.';
    case 'UNAUTHENTICATED':
      return 'Your session has ended. Log in again and your work is still here.';
    case 'CAPACITY_FULL':
      return 'This event is already at capacity.';
    case 'RATE_LIMITED':
      return 'That was a lot of requests at once. Give it a minute and try again.';
    case 'AI_UNAVAILABLE':
      return 'The AI is unavailable right now. You can still make this change yourself.';
    case 'INTERNAL':
      return 'Something went wrong and nothing was changed. Please try again.';
  }
}
