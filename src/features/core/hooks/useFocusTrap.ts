'use client';
import { useEffect, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Last element focused outside any open dialog. Tracked globally because React applies
 * `autoFocus` inside a sheet before the trap's effect runs, so `document.activeElement` at that
 * point is already inside the dialog and cannot tell us where to return focus.
 */
let lastOutsideDialog: HTMLElement | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener(
    'focusin',
    (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && !target.closest('[role="dialog"]')) lastOutsideDialog = target;
    },
    true,
  );
}

export function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
}

/**
 * While `isActive`, keeps keyboard focus inside `ref`: moves focus in on open (keeping it if
 * already inside, else the first focusable, else the container), wraps Tab / Shift+Tab, and
 * returns focus to the element that was focused before opening when it deactivates.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, isActive: boolean): void {
  useEffect(() => {
    if (!isActive) return;
    const root = ref.current;
    if (!root) return;
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // If focus already moved inside (autoFocus), return to where it was before the dialog opened.
    const previous = active && root.contains(active) ? lastOutsideDialog : active;

    if (!root.contains(document.activeElement)) {
      const first = focusableIn(root)[0];
      (first ?? root).focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = focusableIn(root);
      if (items.length === 0) {
        event.preventDefault();
        root.focus();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !root.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !root.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // Restore only once the dialog is really gone. React StrictMode re-runs effects
      // synchronously while the dialog stays mounted; restoring then would steal autoFocus.
      queueMicrotask(() => {
        if (root.isConnected) return;
        if (previous && previous.isConnected) previous.focus();
      });
    };
  }, [ref, isActive]);
}
