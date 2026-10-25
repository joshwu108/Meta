/**
 * Recovery for the business error boundary.
 *
 * `reset()` on its own re-renders the boundary's children against the client router cache,
 * and the cached entry for the failed segment is the error itself — so the owner can click
 * "Try again" forever and keep seeing the same screen after the server is healthy again.
 * Refreshing first and resetting after does not help either: the reset commits before the
 * refetch lands. Both have to happen in one transition, so React commits the cleared
 * boundary together with the newly fetched payload.
 */
export function recoverFromError(
  startTransition: (callback: () => void) => void,
  reset: () => void,
  router: { refresh: () => void },
): void {
  startTransition(() => {
    reset();
    try {
      router.refresh();
    } catch (err: unknown) {
      // A failed refetch is worth seeing, but the boundary has already been cleared and the
      // owner is not left on a dead button.
      console.error('[ws05] could not refresh the failed business screen', err);
    }
  });
}
