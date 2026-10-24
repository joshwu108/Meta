'use client';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/features/core/hooks/useTheme';

/** Light / dark toggle. Stores the choice in localStorage; `system` clears it. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-pressed={isDark}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-pill bg-surface-2 text-text-2 transition-colors duration-[var(--duration-fast)] hover:bg-hover active:bg-pressed ${className}`}
    >
      {isDark ? <Sun size={20} strokeWidth={1.75} /> : <Moon size={20} strokeWidth={1.75} />}
    </button>
  );
}
