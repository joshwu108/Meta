"use client";
import Link from "next/link";
import { useState } from "react";
import type { SuggestionCard } from "../schemas";
import { usePermissions, usePreferences } from "../hooks/use-preferences";
import { AgentLog } from "./agent-log";
import { ChatPanel } from "./chat-panel";
import { PermissionsEditor } from "./permissions-editor";
import { Chip } from "./primitives";
import { SLOT_LABEL } from "./labels";
import s from "./agent.module.css";

type Tab = "preferences" | "permissions" | "log";
const TABS: { id: Tab; label: string }[] = [
  { id: "preferences", label: "Preferences" },
  { id: "permissions", label: "Permissions" },
  { id: "log", label: "Activity log" },
];

function PreferencesSummary() {
  const { prefs } = usePreferences();
  if (!prefs) return <p className={s.muted}>Loading…</p>;
  return (
    <div className={s.stack}>
      <div className={s.row}>{prefs.interests.map((i) => <Chip key={i} label={i} />)}</div>
      <p className={s.muted}>{prefs.availabilitySlots.map((x) => SLOT_LABEL[x]).join(", ") || "No availability set"}</p>
      <Link className={s.link} href="/agent/preferences">Edit preferences</Link>
    </div>
  );
}

function PermissionsSummary() {
  const { consent, update, error } = usePermissions();
  if (!consent) return <p className={error ? s.error : s.muted}>{error ?? "Loading…"}</p>;
  return <PermissionsEditor consent={consent} onChange={update} />;
}

function RailContent({ tab }: { tab: Tab }) {
  if (tab === "preferences") return <PreferencesSummary />;
  if (tab === "permissions") return <PermissionsSummary />;
  return <AgentLog limit={20} />;
}

/** Preferences / Permissions / Activity tabs. In the shell's right rail at ≥1024px (`@aside/agent`), inline below. */
export function AgentRail() {
  const [tab, setTab] = useState<Tab>("preferences");
  return (
    <aside className={`${s.card} ${s.stack}`} aria-label="Your agent settings">
      <div className={s.tabs} role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={s.tab} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel"><RailContent tab={tab} /></div>
    </aside>
  );
}

/** Screen 7: chat; the settings rail sits in the shell's right rail (≥1024px) or below the chat (mobile). */
export function AgentHome() {
  const { update } = usePreferences();
  const [applied, setApplied] = useState<string | null>(null);

  const onApply = async (card: SuggestionCard) => {
    if (!card.patch) return;
    await update(card.patch);
    setApplied("Preferences updated.");
  };

  return (
    <div className={s.page}>
      <h1 className={s.title}>My AI agent</h1>
      <div className={s.stack}>
        <ChatPanel kind="chat" opener="Hi! Want me to find people, events or groups for this week?" onApply={onApply} />
        {applied ? <p className={s.muted} role="status">{applied}</p> : null}
      </div>
      <div className={s.mobileOnly}><AgentRail /></div>
    </div>
  );
}
