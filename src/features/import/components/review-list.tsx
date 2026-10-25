'use client';
import { useState } from 'react';
import { AiTag, Button, Card } from '@/features/core/components/ui';
import type { DecideAction, TraitSuggestion } from '../schemas';

const BAND_TEXT = { strong: 'Strong signal', some: 'Some signal', weak: 'Weak signal' } as const;
const CATEGORY_TEXT: Record<string, string> = {
  creative: 'Creative', food_drink: 'Food & drink', games: 'Games', outdoors: 'Outdoors', fitness: 'Fitness',
  learning: 'Learning', music: 'Music', community: 'Community',
};

export type Decision = { id: string; action: DecideAction; value?: string };

function SuggestionCard({ s, decided, onDecide }: { s: TraitSuggestion; decided?: Decision; onDecide: (d: Decision) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(s.label);
  const isDislike = s.field === 'dislike';
  return (
    <li>
      <Card className={decided ? 'opacity-60' : undefined}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="m-0">{s.label}</h3>
          <AiTag label="AI suggestion" />
        </div>
        <p className="mt-1 text-[length:var(--text-sm)] text-text-2">
          {BAND_TEXT[s.band]}
          {s.category && !isDislike ? ` · Adds to: ${CATEGORY_TEXT[s.category] ?? s.category}` : ''}
        </p>
        <details className="mt-2 text-[length:var(--text-sm)]">
          <summary className="cursor-pointer text-brand">Why?</summary>
          <ul className="mt-1 list-disc pl-5 text-text-2">{s.evidence.map((line) => <li key={line}>{line}</li>)}</ul>
        </details>
        {decided ? (
          <p className="mt-3 font-semibold" role="status">{decidedText(decided)}</p>
        ) : editing ? (
          <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); onDecide({ id: s.id, action: 'edit', value: draft }); }}>
            <label className="sr-only" htmlFor={`edit-${s.id}`}>Edit {s.label}</label>
            <input id={`edit-${s.id}`} className="rounded-md border border-border-strong px-3 py-2" maxLength={40} value={draft} onChange={(e) => setDraft(e.target.value)} />
            <Button type="submit" disabled={!draft.trim()}>Save {draft.trim() || 'interest'}</Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </form>
        ) : isDislike ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => onDecide({ id: s.id, action: 'keep_dislike' })} aria-label={`Keep ${s.label} as a dislike`}>Keep as a dislike</Button>
            <Button variant="ghost" onClick={() => onDecide({ id: s.id, action: 'ignore' })} aria-label={`Ignore ${s.label}`}>Ignore</Button>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => onDecide({ id: s.id, action: 'love' })} aria-label={`Love it: ${s.label}`}>Love it</Button>
            <Button variant="secondary" onClick={() => onDecide({ id: s.id, action: 'yes' })} aria-label={`Yes: ${s.label}`}>Yes</Button>
            <Button variant="secondary" onClick={() => setEditing(true)} aria-label={`Edit ${s.label}`}>Edit</Button>
            <Button variant="ghost" onClick={() => onDecide({ id: s.id, action: 'not_me' })} aria-label={`Not me: ${s.label}`}>Not me</Button>
          </div>
        )}
      </Card>
    </li>
  );
}

function decidedText(d: Decision): string {
  switch (d.action) {
    case 'love': return 'Loved. Saved when you tap Done.';
    case 'yes': return 'Added. Saved when you tap Done.';
    case 'edit': return `Added as “${d.value}”. Saved when you tap Done.`;
    case 'not_me': return 'Not you. We won’t suggest it again.';
    case 'keep_dislike': return 'Kept as a dislike.';
    case 'ignore': return 'Ignored.';
  }
}

function Group({ title, items, decisions, onDecide }: { title: string; items: TraitSuggestion[]; decisions: Map<string, Decision>; onDecide: (d: Decision) => void }) {
  const strong = items.filter((s) => s.band !== 'weak');
  const weak = items.filter((s) => s.band === 'weak');
  if (items.length === 0) return null;
  const list = (xs: TraitSuggestion[]) => (
    <ul role="list" className="grid gap-3 md:grid-cols-2">
      {xs.map((s) => <SuggestionCard key={s.id} s={s} decided={decisions.get(s.id)} onDecide={onDecide} />)}
    </ul>
  );
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="m-0">{title}</h2>
      {list(strong)}
      {weak.length > 0 ? (
        <details>
          <summary className="cursor-pointer text-brand">Maybe ({weak.length} weaker {weak.length === 1 ? 'suggestion' : 'suggestions'})</summary>
          <div className="mt-3">{list(weak)}</div>
        </details>
      ) : null}
    </section>
  );
}

type Props = { suggestions: TraitSuggestion[]; saving: boolean; error: string | null; onDone: (decisions: Decision[]) => void };

/** Review every suggestion one at a time. Nothing is saved until Done for now. */
export function ReviewList({ suggestions, saving, error, onDone }: Props) {
  const [decisions, setDecisions] = useState<Map<string, Decision>>(new Map());
  const decide = (d: Decision) => setDecisions((m) => new Map(m).set(d.id, d));
  const all = [...decisions.values()];
  const added = all.filter((d) => ['love', 'yes', 'edit'].includes(d.action)).length;
  const dismissed = all.length - added;
  const left = suggestions.length - all.length;
  if (suggestions.length === 0) {
    return <Card><p className="m-0">We didn’t find anything new. Your profile already covers what we saw.</p></Card>;
  }
  return (
    <div className="flex flex-col gap-5">
      <p aria-live="polite" className="font-semibold">{added} added · {dismissed} dismissed · {left} left</p>
      <Group title="Interests" items={suggestions.filter((s) => s.field === 'interests')} decisions={decisions} onDecide={decide} />
      <Group title="Activity style" items={suggestions.filter((s) => s.field === 'activity_prefs')} decisions={decisions} onDecide={decide} />
      <Group title="Less of this" items={suggestions.filter((s) => s.field === 'dislike')} decisions={decisions} onDecide={decide} />
      {error ? <p role="alert" className="text-danger">{error}</p> : null}
      <div><Button size="lg" isLoading={saving} onClick={() => onDone(all)}>Done for now</Button></div>
    </div>
  );
}
