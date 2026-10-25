'use client';
import { useState } from 'react';
import { Button, Card } from '@/features/core/components/ui';
import type { ExtractedLabels } from './export-labels';

const PARSE_TIMEOUT_MS = 30_000;

function readInWorker(files: File[]): Promise<ExtractedLabels> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./export-worker.ts', import.meta.url));
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('This file took too long to read. Try only the topics and ads files.'));
    }, PARSE_TIMEOUT_MS);
    worker.onmessage = (e: MessageEvent<ExtractedLabels>) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(e.data);
    };
    worker.onerror = () => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error('Couldn’t read that file.'));
    };
    worker.postMessage(files);
  });
}

type Props = { sending: boolean; onSend: (labels: ExtractedLabels) => void };

/** Phase 3: the export's JSON files are read on this device; only the listed labels are sent. */
export function ExportStep({ sending, onSend }: Props) {
  const [labels, setLabels] = useState<ExtractedLabels | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  async function pick(files: FileList | null) {
    setError(null);
    setLabels(null);
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    setReading(true);
    try {
      const found = await readInWorker(list);
      if (found.topics.length + found.adInterests.length === 0) {
        setError('No topics or ad interests in those files. Choose JSON (not HTML) when you download, and pick the topics and ads files.');
      } else setLabels(found);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t read that file.');
    } finally {
      setReading(false);
    }
  }

  return (
    <Card as="section" aria-labelledby="export-title">
      <h2 id="export-title" className="m-0">Or use your Instagram download</h2>
      <p className="mt-1 text-[length:var(--text-sm)] text-text-2">
        In Instagram, request “Download your information” as JSON, unzip it, and pick your topics and ads interests files. They’re read on this device; only the labels below are sent.
      </p>
      <input type="file" accept="application/json,.json" multiple className="sr-only" id="import-export-files" onChange={(e) => void pick(e.target.files)} />
      <label htmlFor="import-export-files" className="mt-2 inline-flex cursor-pointer items-center rounded-pill border border-border-strong px-4 py-2 font-semibold">
        Choose JSON files
      </label>
      {reading ? <p role="status" className="mt-2 text-text-2">Reading your file on this device…</p> : null}
      {error ? <p role="alert" className="mt-2 text-danger">{error}</p> : null}
      {labels ? (
        <div className="mt-3">
          <p className="m-0">We found {labels.topics.length} topics and {labels.adInterests.length} ad interests. Only these labels will be sent:</p>
          <details className="mt-2">
            <summary className="cursor-pointer text-brand">See every label</summary>
            <p className="mt-1 text-[length:var(--text-sm)] text-text-2">{[...labels.topics, ...labels.adInterests].join(' · ')}</p>
          </details>
          <div className="mt-3 flex gap-2">
            <Button isLoading={sending} onClick={() => onSend(labels)}>Send labels to my agent</Button>
            <Button variant="ghost" onClick={() => setLabels(null)}>Cancel</Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
