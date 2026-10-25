'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Button, Card } from '@/features/core/components/ui';
import { ApiClientError, apiGet, apiPost } from '@/lib/api/client';
import type { DecideResult, ScreensRunResult, TraitSuggestion } from '../schemas';
import type { PreparedImage } from './prepare-image';
import { ReviewList, type Decision } from './review-list';
import { ExportStep } from './export-step';
import type { ExtractedLabels } from './export-labels';
import { ShareStep, type ShareSource } from './share-step';

type Stage = 'loading' | 'share' | 'reading' | 'saving' | 'review' | 'done';

/** Multipart upload with the same envelope unwrapping as 01's API client. */
async function sendScreens(images: PreparedImage[], sources: ShareSource[]): Promise<ScreensRunResult> {
  const form = new FormData();
  images.forEach((image, i) => form.append('images', image.blob, `screen-${i + 1}.jpg`));
  sources.forEach((source) => form.append('sources', source));
  const response = await fetch('/api/import/screens', { method: 'POST', body: form, credentials: 'same-origin' });
  const envelope = (await response.json().catch(() => null)) as { ok: boolean; data?: ScreensRunResult; error?: { code: string; message: string } } | null;
  if (!envelope) throw new ApiClientError('INTERNAL', `The server returned ${response.status}`);
  if (!envelope.ok) throw new ApiClientError(envelope.error!.code as never, envelope.error!.message);
  return envelope.data!;
}

const message = (err: unknown, fallback: string) => (err instanceof ApiClientError ? err.message : fallback);

type Props = {
  /** Shown after Done for now ("Back to review" in onboarding). */
  after?: (result: DecideResult | null) => ReactNode;
  /** Called after decisions are saved, e.g. to rebuild the plan. */
  onDecided?: () => void;
};

/** "Bring in your Instagram taste": share → read → review. Every save is a tap the user makes. */
export function ImportFlow({ after, onDecided }: Props) {
  const [stage, setStage] = useState<Stage>('loading');
  const [suggestions, setSuggestions] = useState<TraitSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DecideResult | null>(null);

  const load = useCallback(async () => {
    const pending = await apiGet<TraitSuggestion[]>('/api/import/suggestions');
    setSuggestions(pending);
    return pending;
  }, []);

  useEffect(() => {
    load()
      .then((pending) => setStage(pending.length > 0 ? 'review' : 'share'))
      .catch(() => setStage('share'));
  }, [load]);

  async function send(images: PreparedImage[], sources: ShareSource[]) {
    setError(null);
    setStage('reading');
    try {
      await sendScreens(images, sources);
      await load();
      setStage('review');
    } catch (err) {
      setError(message(err, 'Couldn’t read those screenshots. Try again.'));
      setStage('share');
    }
  }

  async function sendExport(labels: ExtractedLabels) {
    setError(null);
    setStage('reading');
    try {
      await apiPost<ScreensRunResult>('/api/import/export', labels);
      await load();
      setStage('review');
    } catch (err) {
      setError(message(err, 'Couldn’t use those labels. Try again.'));
      setStage('share');
    }
  }

  async function done(decisions: Decision[]) {
    setError(null);
    if (decisions.length === 0) {
      setStage('done');
      return;
    }
    setStage('saving');
    try {
      setResult(await apiPost<DecideResult>('/api/import/suggestions/decide', { decisions }));
      setStage('done');
      onDecided?.();
    } catch (err) {
      setError(message(err, 'Couldn’t save your choices. Try again.'));
      await load().catch(() => undefined);
      setStage('review');
    }
  }

  if (stage === 'loading') return <p className="text-text-2">Loading…</p>;
  if (stage === 'share') {
    return (
      <div className="flex flex-col gap-4">
        <ShareStep sending={false} error={error} onSend={(images, sources) => void send(images, sources)} />
        <ExportStep sending={false} onSend={(labels) => void sendExport(labels)} />
      </div>
    );
  }
  if (stage === 'reading' || stage === 'saving') {
    return (
      <Card aria-busy="true">
        <p className="m-0" role="status">{stage === 'saving' ? 'Saving what you chose…' : 'Your agent is looking for interests that fit you…'}</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2" aria-hidden>
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-md bg-surface" />)}
        </div>
      </Card>
    );
  }
  if (stage === 'review') {
    return (
      <div className="flex flex-col gap-4">
        <ReviewList suggestions={suggestions} saving={false} error={error} onDone={(d) => void done(d)} />
        <div><Button variant="ghost" onClick={() => setStage('share')}>Add more screenshots</Button></div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <Card role="status">
        <p className="m-0">
          {result && result.added > 0
            ? `Added ${result.added} to your profile. They’ll help with matches, groups and events, using your current permissions. You can remove them any time.`
            : 'Nothing was added. Anything you didn’t decide on waits here for 30 days.'}
        </p>
      </Card>
      {after?.(result)}
    </div>
  );
}
