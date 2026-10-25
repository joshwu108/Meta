'use client';

import { useState } from 'react';
import { ApiClientError, fieldErrors } from '@/lib/api/client';
import { submitErrorMessage } from './submit-error';

/**
 * One submit-and-navigate for every business form.
 *
 * Two things here are deliberate, and both were found by driving the UI in a production
 * build rather than by reasoning about it:
 *
 *   1. **Not `useTransition`.** `router.push()` from inside a `startTransition` body does
 *      not settle when the page was reached by a client-side navigation, so the form stays
 *      disabled forever.
 *   2. **No state update after `after()`.** Re-rendering while a navigation is in flight
 *      makes Next discard it — the RSC payload for the target route is fetched and then
 *      thrown away, and the URL never changes.
 */

export type SubmitState = {
  /** True while a request is in flight; drives the disabled state on every button. */
  busy: boolean;
  /** A whole-form message, shown above the fields. */
  message: string | null;
  /** Field name -> message, from the server's `details`. */
  errors: Record<string, string>;
  submit: (action: () => Promise<unknown>, after?: () => void) => Promise<void>;
  /** Go to another page after a mutation. See `navigate` below for why it is a real load. */
  navigate: (href: string) => void;
};

export function useSubmit(): SubmitState {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async (action: () => Promise<unknown>, after?: () => void): Promise<void> => {
    setBusy(true);
    setMessage(null);
    setErrors({});

    try {
      await action();
    } catch (err) {
      if (err instanceof ApiClientError) {
        // Server wording is owner-facing only for VALIDATION; see `submitErrorMessage`.
        setMessage(submitErrorMessage(err.code, err.message));
        setErrors(fieldErrors(err.details));
      } else {
        setMessage('Something went wrong. Please try again.');
      }
      setBusy(false);
      return;
    }

    // Clear the flag *before* navigating. A state update after `router.push()` re-renders
    // this component while the navigation is in flight and Next discards it: the RSC
    // payload for the target route is fetched and then thrown away, leaving the URL
    // unchanged. Only visible in a production build driven through the UI.
    setBusy(false);
    after?.();
  };

  /**
   * A full navigation, not `router.push()`.
   *
   * After a mutation the owner is almost always sent back to a page they clicked through
   * from, so that route is already in the App Router cache. `push()` to it is deduped into
   * a no-op: the RSC payload is fetched and discarded and the URL never changes, which left
   * the form sitting there looking broken. `router.refresh()` beforehand does not help.
   * A real load costs one round trip and guarantees every server component re-reads its
   * data, which is what you want after creating, publishing or cancelling an event anyway.
   */
  const navigate = (href: string): void => {
    window.location.assign(href);
  };

  return { busy, message, errors, submit, navigate };
}
