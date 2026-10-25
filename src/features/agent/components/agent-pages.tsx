"use client";
import Link from "next/link";
import { usePermissions, usePreferences } from "../hooks/use-preferences";
import { AgentLog } from "./agent-log";
import { PermissionsEditor } from "./permissions-editor";
import { PreferencesEditor } from "./preferences-editor";
import s from "./agent.module.css";

function Frame({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <div className={s.page}>
      <Link className={s.link} href="/agent">← My AI agent</Link>
      <h1 className={s.title}>{title}</h1>
      <p className={s.muted}>{intro}</p>
      <section className={s.card}>{children}</section>
    </div>
  );
}

export function PreferencesPage() {
  const { prefs, error, update } = usePreferences();
  return (
    <Frame title="Preferences" intro="Edit anything your agent knows. Removing an AI-inferred value is saved right away.">
      {error ? <p className={s.error} role="alert">{error}</p> : null}
      {prefs ? <PreferencesEditor value={prefs} onChange={update} /> : <p className={s.muted}>Loading…</p>}
    </Frame>
  );
}

export function PermissionsPage() {
  const { consent, error, update } = usePermissions();
  return (
    <Frame title="Permissions" intro="Nothing leaves your agent unless you switch it on here. Your chats are never shared.">
      {error ? <p className={s.error} role="alert">{error}</p> : null}
      {consent ? <PermissionsEditor consent={consent} onChange={update} /> : <p className={s.muted}>Loading…</p>}
    </Frame>
  );
}

export function LogPage() {
  return (
    <Frame title="Activity log" intro="Every time your agent used or shared your information.">
      <AgentLog />
    </Frame>
  );
}
