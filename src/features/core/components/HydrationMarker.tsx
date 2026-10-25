'use client';
import { useEffect } from 'react';

/**
 * Sets `<html data-hydrated="true">` once React has hydrated. E2E tests wait for it before
 * interacting, because a click that lands before hydration is dropped on a fast production build.
 */
export function HydrationMarker() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = 'true';
  }, []);
  return null;
}
