'use client';

import { Chip } from '@/features/core/components/ui';

/** A set of options the owner toggles. Immutable updates: a new array every time. */
export function ChipMultiSelect<T extends string>({
  options,
  selected,
  onChange,
  labelOf,
}: {
  options: readonly T[];
  selected: readonly T[];
  onChange: (next: T[]) => void;
  labelOf?: (value: T) => string;
}) {
  const toggle = (value: T) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Chip key={option} selected={selected.includes(option)} onSelect={() => toggle(option)}>
          {labelOf ? labelOf(option) : option}
        </Chip>
      ))}
    </div>
  );
}

/** Free-text tags (equipment, formats) entered one per line and stored as an array. */
export function TagList({
  value,
  onChange,
  placeholder,
}: {
  value: readonly string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <input
        className="w-full rounded-sm border border-divider bg-surface px-3 py-2 text-base placeholder:text-text-3"
        placeholder={placeholder}
        defaultValue={value.join(', ')}
        onBlur={(event) =>
          onChange(
            event.target.value
              .split(',')
              .map((tag) => tag.trim())
              .filter((tag) => tag.length > 0),
          )
        }
      />
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {value.map((tag) => (
            <Chip key={tag} selected>
              {tag}
            </Chip>
          ))}
        </div>
      ) : null}
    </div>
  );
}
