'use client';
import { useEffect, useRef, type RefObject } from 'react';

/**
 * When an action removes the element that had focus (a sheet closing, a row going away), the browser
 * drops focus to `<body>` and keyboard users start over at the top of the page. Each time `signal`
 * changes, this puts focus on `target` instead. It never runs on first render, and it leaves focus
 * alone when it is anywhere but `<body>`.
 */
export function useFocusFallback(target: RefObject<HTMLElement | null>, signal: string) {
  const previous = useRef(signal);
  useEffect(() => {
    if (previous.current === signal) return;
    previous.current = signal;
    if (document.activeElement === document.body) target.current?.focus({ preventScroll: true });
  }, [signal, target]);
}
