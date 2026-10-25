'use client';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * A tab strip's selection kept in the `?tab=` query param, so a link to `?tab=x` (the notification
 * bell, a redirect) selects that tab even when the page is already open. Switching tabs rewrites
 * the URL in place: no history entry and no server round trip. The fallback tab stays out of the URL.
 */
export function useUrlTab<T extends string>(tabs: readonly T[], fallback: T): [T, (next: T) => void] {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const requested = searchParams.get('tab');
  const tab = tabs.find((value) => value === requested) ?? fallback;
  const select = (next: T) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === fallback) params.delete('tab');
    else params.set('tab', next);
    const query = params.toString();
    window.history.replaceState(null, '', query ? `${pathname}?${query}` : pathname);
  };
  return [tab, select];
}
