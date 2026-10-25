"use client";
import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import type { ChatResponse, SuggestionCard } from "../schemas";
import { api, ApiCallError } from "../hooks/use-api";
import { AgentAvatar, AiTag, Button } from "./primitives";
import s from "./agent.module.css";

export type ChatLine = { role: "user" | "assistant"; content: string; suggestions?: SuggestionCard[] };

export function SuggestionCardView({ card, onApply }: { card: SuggestionCard; onApply?: (c: SuggestionCard) => void }) {
  return (
    <article className={s.suggestion}>
      <div className={s.between}>
        <Link href={card.href}>{card.title}</Link>
        <AiTag label="AI suggestion" />
      </div>
      {card.subtitle ? <p className={s.muted}>{card.subtitle}</p> : null}
      <p className={s.muted}>{card.explanation}</p>
      <details className={s.why}>
        <summary>Why this?</summary>
        {card.highlights.length ? (
          <ul>{card.highlights.map((h) => <li key={h}>{h}</li>)}</ul>
        ) : (
          <p className={s.muted}>{card.explanation}</p>
        )}
      </details>
      {card.kind === "preference_update" && onApply ? (
        <div className={s.row}>
          <Button onClick={() => onApply(card)}>Apply</Button>
        </div>
      ) : null}
      {card.kind !== "preference_update" ? <FeedbackButtons about={`${card.kind}:${card.targetId}`} /> : null}
    </article>
  );
}

/** Thumbs up/down remembered by the agent and used in later suggestions. */
function FeedbackButtons({ about }: { about: string }) {
  const [sent, setSent] = useState<"up" | "down" | null>(null);
  const send = (signal: "up" | "down") => {
    setSent(signal);
    api("/api/agent/feedback", { method: "POST", body: { about, signal } }).catch(() => setSent(null));
  };
  return (
    <div className={s.row} role="group" aria-label="Was this useful?">
      <Button variant="ghost" aria-pressed={sent === "up"} aria-label="More like this" onClick={() => send("up")}>👍</Button>
      <Button variant="ghost" aria-pressed={sent === "down"} aria-label="Less like this" onClick={() => send("down")}>👎</Button>
      {sent ? <span className={s.muted} role="status">Thanks, your agent will remember.</span> : null}
    </div>
  );
}

type Props = {
  kind: "onboarding" | "chat";
  opener: string;
  initial?: ChatLine[];
  /** Conversation the initial lines belong to, so new messages continue it. */
  initialConversationId?: string;
  onResponse?: (res: ChatResponse) => void;
  onApply?: (card: SuggestionCard) => void;
  /** Called with the envelope error code, e.g. AI_UNAVAILABLE, so the parent can offer a fallback. */
  onError?: (code: string) => void;
  disabled?: boolean;
};

/** Chat with the personal agent. The log is an aria-live region. */
export function ChatPanel({ kind, opener, initial = [], initialConversationId, onResponse, onApply, onError, disabled }: Props) {
  const [lines, setLines] = useState<ChatLine[]>(initial);
  const [conversationId, setConversationId] = useState<string | undefined>(initialConversationId);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  async function send(e: FormEvent) {
    e.preventDefault();
    const message = draft.trim();
    if (!message || pending) return;
    setDraft("");
    setError(null);
    setLines((l) => [...l, { role: "user", content: message }]);
    setPending(true);
    try {
      const res = await api<ChatResponse>("/api/agent/chat", { method: "POST", body: { kind, message, conversationId } });
      setConversationId(res.conversationId);
      setLines((l) => [...l, { role: "assistant", content: res.reply, suggestions: res.suggestions }]);
      onResponse?.(res);
    } catch (err) {
      setError(err instanceof ApiCallError ? err.message : "Something went wrong. Try again.");
      onError?.(err instanceof ApiCallError ? err.code : "INTERNAL");
      setLines((l) => l.slice(0, -1));
      setDraft(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={`${s.card} ${s.stack}`} aria-label="Chat with your agent">
      <header className={s.row}>
        <AgentAvatar />
        <div>
          <h2 className={s.h3} style={{ margin: 0 }}>Your agent</h2>
          <p className={s.muted}>Suggests, never commits you to anything</p>
        </div>
      </header>
      <div className={s.chatLog} aria-live="polite" aria-busy={pending}>
        <p className={`${s.bubble} ${s.theirs}`}>{opener}</p>
        {lines.map((line, i) => (
          <div key={i} className={s.stack}>
            <p className={`${s.bubble} ${line.role === "user" ? s.mine : s.theirs}`}>{line.content}</p>
            {line.suggestions?.map((c) => <SuggestionCardView key={`${c.kind}-${c.targetId}`} card={c} onApply={onApply} />)}
          </div>
        ))}
        {pending ? <p className={`${s.bubble} ${s.theirs}`}>…</p> : null}
      </div>
      {error ? <p className={s.error} role="alert">{error}</p> : null}
      <form className={s.composer} onSubmit={send}>
        <label htmlFor={inputId} className="sr-only" style={{ position: "absolute", left: -9999 }}>Message</label>
        <input
          id={inputId}
          className={s.input}
          value={draft}
          maxLength={2000}
          placeholder="Message your agent"
          onChange={(e) => setDraft(e.target.value)}
          disabled={disabled}
        />
        <Button type="submit" disabled={pending || disabled || !draft.trim()}>Send</Button>
      </form>
    </section>
  );
}
