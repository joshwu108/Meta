'use client';
import { cn } from './cn';

export type TabItem<T extends string> = { value: T; label: string; count?: number };

export type TabsProps<T extends string> = {
  items: ReadonlyArray<TabItem<T>>;
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
};

/** Underline tabs: active underline 3px brand, text brand. Arrow keys move between tabs. */
export function Tabs<T extends string>({ items, value, onChange, ariaLabel }: TabsProps<T>) {
  const move = (delta: number) => {
    const index = items.findIndex((item) => item.value === value);
    const next = items[(index + delta + items.length) % items.length];
    if (next) onChange(next.value);
  };
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex gap-1 border-b border-border-subtle">
      {items.map((item) => {
        const isActive = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            type="button"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(item.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight') move(1);
              if (event.key === 'ArrowLeft') move(-1);
            }}
            className={cn(
              'relative -mb-px h-11 px-3 font-semibold transition-colors duration-[var(--duration-fast)] hover:bg-hover',
              isActive ? 'text-brand-ink' : 'text-text-2',
            )}
          >
            {item.label}
            {item.count !== undefined && <span className="ml-1.5 rounded-pill bg-surface-2 px-1.5 text-[length:var(--text-xs)] text-text-2">{item.count}</span>}
            <span
              aria-hidden
              className={cn(
                'absolute inset-x-0 bottom-0 h-[3px] rounded-t bg-brand transition-transform duration-[var(--duration-normal)] ease-[var(--ease-standard)]',
                isActive ? 'scale-x-100' : 'scale-x-0',
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
