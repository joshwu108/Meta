'use client';
import { useId, useState, type KeyboardEvent } from 'react';
import { Chip, Input } from '@/features/core/components/ui';
import { VISIBILITY, type Visibility } from '@/shared/enums';
import { chipLabel } from '@/shared/labels';
import { VISIBILITY_COPY } from '../labels';

export type GroupFormValues = { name: string; description: string; interests: string[]; visibility: Visibility };

const MAX_INTERESTS = 12;
const toTag = (raw: string) =>
  raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

const fieldClass =
  'w-full rounded-sm border border-divider bg-surface px-3 py-2 text-text placeholder:text-text-3 focus:border-brand focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand';

function InterestsInput({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const id = useId();
  const add = () => {
    const tag = toTag(draft);
    if (tag && !value.includes(tag) && value.length < MAX_INTERESTS) onChange([...value, tag]);
    setDraft('');
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      add();
    }
    if (event.key === 'Backspace' && draft === '' && value.length > 0) onChange(value.slice(0, -1));
  };
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[length:var(--text-sm)] font-medium text-text-2">
        Interests
      </label>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Group interests">
          {value.map((tag) => (
            <li key={tag}>
              <Chip selected onRemove={() => onChange(value.filter((t) => t !== tag))}>
                {chipLabel(tag)}
              </Chip>
            </li>
          ))}
        </ul>
      )}
      <input id={id} className={`${fieldClass} h-10`} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown} onBlur={add} placeholder="pottery, coffee, board games" />
      <p className="text-[length:var(--text-xs)] text-text-3">Press Enter after each one. They help the planner and people searching for groups.</p>
    </div>
  );
}

function VisibilityChoice({ value, onChange }: { value: Visibility; onChange: (next: Visibility) => void }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-[length:var(--text-sm)] font-medium text-text-2">Who can see it</legend>
      {VISIBILITY.map((option) => (
        <label key={option} className="flex cursor-pointer items-start gap-3 rounded-md border border-border-subtle p-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
          <input type="radio" name="visibility" value={option} checked={value === option} onChange={() => onChange(option)} className="mt-1 accent-[var(--color-brand)]" />
          <span>
            <span className="block font-semibold">{VISIBILITY_COPY[option].label}</span>
            <span className="block text-[length:var(--text-sm)] text-text-2">{VISIBILITY_COPY[option].description}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/** Name, description, interests and visibility (create and edit group). */
export function GroupFormFields({ values, onChange }: { values: GroupFormValues; onChange: (next: GroupFormValues) => void }) {
  const descriptionId = useId();
  return (
    <div className="flex flex-col gap-4">
      <Input label="Name" value={values.name} maxLength={80} required onChange={(e) => onChange({ ...values, name: e.target.value })} placeholder="Thursday Makers" />
      <div className="flex flex-col gap-1">
        <label htmlFor={descriptionId} className="text-[length:var(--text-sm)] font-medium text-text-2">
          Description (optional)
        </label>
        <textarea id={descriptionId} className={`${fieldClass} min-h-20`} maxLength={1000} value={values.description} onChange={(e) => onChange({ ...values, description: e.target.value })} placeholder="What do you do together?" />
      </div>
      <InterestsInput value={values.interests} onChange={(interests) => onChange({ ...values, interests })} />
      <VisibilityChoice value={values.visibility} onChange={(visibility) => onChange({ ...values, visibility })} />
    </div>
  );
}
