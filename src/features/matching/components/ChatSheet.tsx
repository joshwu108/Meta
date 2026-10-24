'use client';
import { Send } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Button, Sheet, cn } from '@/features/core/components/ui';
import { fetchJson } from '@/lib/api/fetch-json';
import type { DirectMessage } from '../server/messages';

const POLL_MS = 5000;

type Props = { connection: { id: string; displayName: string } | null; onClose: () => void };

function mergeMessages(current: readonly DirectMessage[], incoming: readonly DirectMessage[]): DirectMessage[] {
  const seen = new Set(current.map((m) => m.id));
  return [...current, ...incoming.filter((m) => !seen.has(m.id))];
}

/** Polls the conversation every 5s while open (P1 basic messaging; text only). */
function useConversation(connectionId: string | null) {
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!connectionId) return;
    let cancelled = false;
    let last: string | undefined;
    setMessages([]);
    setError(null);
    const load = async () => {
      const query = last ? `?after=${encodeURIComponent(last)}` : '';
      const res = await fetchJson<DirectMessage[]>(`/api/connections/${connectionId}/messages${query}`);
      if (cancelled) return;
      if (!res.ok) return setError(res.error.message);
      if (res.data.length > 0) last = res.data[res.data.length - 1]!.createdAt;
      setMessages((current) => mergeMessages(current, res.data));
    };
    void load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [connectionId]);
  return { messages, error, append: (m: DirectMessage) => setMessages((current) => mergeMessages(current, [m])), setError };
}

export function ChatSheet({ connection, onClose }: Props) {
  const { messages, error, append, setError } = useConversation(connection?.id ?? null);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const endRef = useRef<HTMLLIElement>(null);
  const inputId = useId();
  useEffect(() => endRef.current?.scrollIntoView({ block: 'end' }), [messages.length]);
  if (!connection) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setIsSending(true);
    const res = await fetchJson<DirectMessage>(`/api/connections/${connection.id}/messages`, { method: 'POST', body: { body } });
    setIsSending(false);
    if (!res.ok) return setError(res.error.message);
    append(res.data);
    setDraft('');
  };

  return (
    <Sheet isOpen onClose={onClose} title={connection.displayName}>
      <ol aria-live="polite" aria-label={`Messages with ${connection.displayName}`} className="flex min-h-48 flex-col gap-2">
        {messages.length === 0 && !error && <li className="py-6 text-center text-[length:var(--text-sm)] text-text-2">Say hi and suggest something to do together.</li>}
        {messages.map((m) => (
          <li key={m.id} className={cn('max-w-[80%] rounded-lg px-3 py-2', m.mine ? 'self-end bg-brand text-text-on-brand' : 'self-start bg-surface-2 text-text')}>
            <span className="sr-only">{m.mine ? 'You: ' : `${connection.displayName}: `}</span>
            {m.body}
          </li>
        ))}
        <li ref={endRef} aria-hidden />
      </ol>
      {error && (
        <p role="alert" className="mt-2 rounded-md bg-danger-soft px-3 py-2 text-[length:var(--text-sm)] text-danger">
          {error}
        </p>
      )}
      <form onSubmit={submit} className="mt-3 flex items-center gap-2">
        <label htmlFor={inputId} className="sr-only">
          Message
        </label>
        <input id={inputId} value={draft} maxLength={1000} onChange={(e) => setDraft(e.target.value)} placeholder="Write a message" className="h-10 min-w-0 flex-1 rounded-pill border border-divider bg-surface-2 px-4 text-text placeholder:text-text-3 focus:border-brand focus:outline-none" />
        <Button type="submit" aria-label="Send" isLoading={isSending} disabled={!draft.trim()} leadingIcon={<Send size={16} aria-hidden />}>
          Send
        </Button>
      </form>
    </Sheet>
  );
}
