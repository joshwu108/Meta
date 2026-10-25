'use client';
import { useEffect, useRef, useState } from 'react';
import { Button, Card } from '@/features/core/components/ui';
import { MAX_FILES, MAX_TOTAL_BYTES, prepareImage, totalBytes, type PreparedImage } from './prepare-image';

export type ShareSource = 'your_algorithm' | 'explore';

const HOW_TO: Record<ShareSource, { title: string; steps: string[] }> = {
  your_algorithm: {
    title: 'Your Algorithm screenshot',
    steps: [
      'In Instagram, open Reels and tap the Your Algorithm icon at the top right.',
      'Scroll so the summary and your topic list are on screen.',
      'Take a screenshot (two if the list is long).',
    ],
  },
  explore: {
    title: 'Explore screenshots',
    steps: [
      'Open the Explore tab (the magnifying glass).',
      'Let the grid load, then take a screenshot.',
      'Scroll a little and take another if you like. Avoid opening anyone’s post.',
    ],
  },
};

type Props = { sending: boolean; error: string | null; onSend: (images: PreparedImage[], sources: ShareSource[]) => void };

export function ShareStep({ sending, error, onSend }: Props) {
  const [sources, setSources] = useState<Record<ShareSource, boolean>>({ your_algorithm: true, explore: false });
  const [images, setImages] = useState<PreparedImage[]>([]);
  const [pickError, setPickError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const chosen = (Object.keys(sources) as ShareSource[]).filter((k) => sources[k]);

  // Preview URLs are freed when an image is removed and when the step unmounts, never while shown.
  const live = useRef<PreparedImage[]>([]);
  live.current = images;
  useEffect(() => () => live.current.forEach((image) => URL.revokeObjectURL(image.url)), []);

  async function pick(files: FileList | null) {
    setPickError(null);
    const list = Array.from(files ?? []).slice(0, MAX_FILES - images.length);
    try {
      const prepared = await Promise.all(list.map(prepareImage));
      const next = [...images, ...prepared];
      if (totalBytes(next) > MAX_TOTAL_BYTES) throw new Error('Those screenshots are over 4 MB together. Remove one.');
      setImages(next);
    } catch (err) {
      setPickError(err instanceof Error ? err.message : 'Couldn’t read that file.');
    }
    if (input.current) input.current.value = '';
  }

  function remove(id: string) {
    const gone = images.find((image) => image.id === id);
    if (gone) URL.revokeObjectURL(gone.url);
    setImages((current) => current.filter((image) => image.id !== id));
  }

  return (
    <div className="flex flex-col gap-4">
      <Card as="section" aria-labelledby="share-what">
        <h2 id="share-what" className="mb-2">What to share</h2>
        <p className="mb-3 text-text-2">
          Screenshots are sent to our AI provider to read topics and aren’t stored. Nothing is added to your profile unless you tap it.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {(Object.keys(HOW_TO) as ShareSource[]).map((key) => (
            <div key={key} className="rounded-md border border-border-subtle p-3">
              <label className="flex items-center gap-2 font-semibold">
                <input type="checkbox" checked={sources[key]} onChange={(e) => setSources((s) => ({ ...s, [key]: e.target.checked }))} />
                {HOW_TO[key].title}
              </label>
              <ol className="mt-2 list-decimal pl-5 text-[length:var(--text-sm)] text-text-2">
                {HOW_TO[key].steps.map((step) => <li key={step}>{step}</li>)}
              </ol>
            </div>
          ))}
        </div>
      </Card>

      <Card as="section" aria-labelledby="share-pick">
        <h2 id="share-pick" className="mb-2">Your screenshots</h2>
        <p className="mb-3 text-[length:var(--text-sm)] text-text-2">Up to {MAX_FILES} PNG, JPEG or WebP images. They’re shrunk on this device first.</p>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" id="import-files"
          onChange={(e) => void pick(e.target.files)} disabled={images.length >= MAX_FILES || sending} />
        <label htmlFor="import-files" className="inline-flex cursor-pointer items-center rounded-pill border border-border-strong px-4 py-2 font-semibold">
          Choose screenshots
        </label>
        {images.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-3" aria-label="Screenshots to send">
            {images.map((image) => (
              <li key={image.id} className="flex flex-col items-center gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview, never uploaded until Send */}
                <img src={image.url} alt={`Preview of ${image.name}`} className="h-28 w-16 rounded-md object-cover" />
                <Button variant="ghost" onClick={() => remove(image.id)} aria-label={`Remove ${image.name}`}>Remove</Button>
              </li>
            ))}
          </ul>
        ) : null}
        {pickError ? <p role="alert" className="mt-2 text-danger">{pickError}</p> : null}
        <p className="mt-3 text-[length:var(--text-sm)] text-text-2">
          {images.length === 0
            ? 'Nothing will be sent until you tap Send.'
            : `You’re about to send ${images.length} screenshot${images.length === 1 ? '' : 's'} (${chosen.map((c) => HOW_TO[c].title).join(', ') || 'choose what they show'}).`}
        </p>
      </Card>

      {error ? <p role="alert" className="text-danger">{error}</p> : null}
      <div className="flex gap-3">
        <Button size="lg" isLoading={sending} disabled={images.length === 0 || chosen.length === 0} onClick={() => onSend(images, chosen)}>
          Send to my agent
        </Button>
      </div>
    </div>
  );
}
