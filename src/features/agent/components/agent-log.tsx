"use client";
import { useEffect, useState } from "react";
import { api } from "../hooks/use-api";
import { permissionsLabel } from "./labels";
import s from "./agent.module.css";

type LogRow = { id: string; actor: string; action: string; permissions_used: string[]; result: string; created_at: string };

export function timeAgo(iso: string, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

/** "Your agent shared your interests and Thursday availability for matching · 2h ago" */
export function AgentLog({ limit = 50 }: { limit?: number }) {
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<LogRow[]>(`/api/agent/log?limit=${limit}`).then(setRows, () => setError("Couldn't load your activity log."));
  }, [limit]);

  if (error) return <p className={s.error} role="alert">{error}</p>;
  if (!rows) return <p className={s.muted}>Loading…</p>;
  if (rows.length === 0) return <p className={s.empty}>Your agent hasn&apos;t shared anything yet.</p>;
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {rows.map((r) => (
        <li key={r.id} className={s.logItem}>
          <p style={{ margin: 0 }}>{r.result}</p>
          <p className={s.muted}>
            {r.permissions_used.length ? `${permissionsLabel(r.permissions_used)} · ` : ""}
            <time dateTime={r.created_at}>{timeAgo(r.created_at)}</time>
          </p>
        </li>
      ))}
    </ul>
  );
}
