'use client';
import { useEffect, useRef, useState } from 'react';
import { Button, Card } from '@/features/core/components/ui';
import { ApiClientError, apiGet } from '@/lib/api/client';
import type { ImportSettings } from '../schemas';

type DeleteResult = { deletedSuggestions: number; keptTraits: number; removedTraits: number };

async function deleteData(acceptedTraits: 'keep' | 'remove'): Promise<DeleteResult> {
  const response = await fetch('/api/import/data', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acceptedTraits }),
    credentials: 'same-origin',
  });
  const envelope = (await response.json().catch(() => null)) as { ok: boolean; data?: DeleteResult; error?: { code: string; message: string } } | null;
  if (!envelope?.ok) throw new ApiClientError((envelope?.error?.code ?? 'INTERNAL') as never, envelope?.error?.message ?? 'Couldn’t delete. Try again.');
  return envelope.data!;
}

/** /agent/import/settings: what came from Instagram, and "Delete my Instagram data". */
export function SettingsView() {
  const [data, setData] = useState<ImportSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const dialogTitle = useRef<HTMLHeadingElement>(null);

  const load = () => apiGet<ImportSettings>('/api/import/data').then(setData).catch((err) => setError(err instanceof ApiClientError ? err.message : 'Couldn’t load.'));
  useEffect(() => void load(), []);
  useEffect(() => {
    if (asking) dialogTitle.current?.focus();
  }, [asking]);

  async function confirm(choice: 'keep' | 'remove') {
    setBusy(true);
    setError(null);
    try {
      const result = await deleteData(choice);
      setDone(choice === 'keep'
        ? `Deleted. You kept the ${result.keptTraits} you added; they’re just your preferences now.`
        : `Deleted, and removed the ${result.removedTraits} you had added.`);
      setAsking(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Couldn’t delete. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <p className={error ? 'text-danger' : 'text-text-2'} role={error ? 'alert' : 'status'}>{error ?? 'Loading…'}</p>;
  const n = data.added.length;
  return (
    <div className="flex flex-col gap-4">
      {done ? <Card role="status"><p className="m-0">{done}</p></Card> : null}
      <Card as="section" aria-labelledby="added-title">
        <h2 id="added-title" className="m-0">Added from your Instagram taste</h2>
        {n === 0 ? (
          <p className="mt-2 text-text-2">Nothing yet.</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {data.added.map((a) => (
              <li key={`${a.field}:${a.value}`} className="rounded-pill border border-border-subtle px-3 py-1">
                {a.value}{a.strength === 'love' ? ' ♥' : ''}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[length:var(--text-sm)] text-text-2">Only you can see where these came from.</p>
      </Card>
      <Card as="section" aria-labelledby="dislikes-title">
        <h2 id="dislikes-title" className="m-0">Not for you</h2>
        {data.dislikes.length === 0 ? (
          <p className="mt-2 text-text-2">Nothing yet.</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {data.dislikes.map((d) => <li key={d.label} className="rounded-pill border border-border-subtle px-3 py-1">{d.label.replace(/-/g, ' ')}</li>)}
          </ul>
        )}
        <p className="mt-2 text-[length:var(--text-sm)] text-text-2">{data.pending} suggestion{data.pending === 1 ? '' : 's'} waiting for review.</p>
      </Card>
      {error ? <p role="alert" className="text-danger">{error}</p> : null}
      {asking ? (
        <Card as="section" role="alertdialog" aria-labelledby="delete-title" aria-describedby="delete-desc">
          <h2 id="delete-title" ref={dialogTitle} tabIndex={-1} className="m-0">Delete your Instagram data?</h2>
          <p id="delete-desc" className="mt-2">
            This removes {data.pending} suggestion{data.pending === 1 ? '' : 's'} waiting for review, your “not for you” list and your plan.
            {n > 0 ? ` You added ${n} from it: ${data.added.map((a) => a.value).join(', ')}.` : ''}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" isLoading={busy} onClick={() => void confirm('keep')}>Keep the {n} I added</Button>
            <Button variant="secondary" isLoading={busy} onClick={() => void confirm('remove')}>Remove those too</Button>
            <Button variant="ghost" onClick={() => setAsking(false)}>Cancel</Button>
          </div>
        </Card>
      ) : (
        <div><Button variant="danger" onClick={() => setAsking(true)}>Delete my Instagram data</Button></div>
      )}
    </div>
  );
}
