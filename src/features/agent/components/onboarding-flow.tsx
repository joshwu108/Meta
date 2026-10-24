"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DEFAULT_CONSENT, type ChatResponse, type Consent } from "../schemas";
import { api, ApiCallError } from "../hooks/use-api";
import { usePreferences } from "../hooks/use-preferences";
import { ChatPanel } from "./chat-panel";
import { PermissionsEditor } from "./permissions-editor";
import { PreferencesEditor } from "./preferences-editor";
import { AiTag, Button, Chip } from "./primitives";
import { SF_NEIGHBORHOODS, SLOT_LABEL, GROUP_SIZE_LABEL } from "./labels";
import s from "./agent.module.css";

type Step = "basics" | "talk" | "review";
const STEPS: Step[] = ["basics", "talk", "review"];

function Progress({ step }: { step: Step }) {
  const at = STEPS.indexOf(step);
  return (
    <ol className={s.steps} aria-label={`Step ${at + 1} of 3`}>
      {STEPS.map((x, i) => <li key={x} className={`${s.step} ${i <= at ? s.stepDone : ""}`} />)}
    </ol>
  );
}

function Basics({ onDone }: { onDone: () => void }) {
  const [hood, setHood] = useState("");
  const [radius, setRadius] = useState(5);
  const [error, setError] = useState<string | null>(null);
  const match = SF_NEIGHBORHOODS.find((n) => n.name.toLowerCase() === hood.trim().toLowerCase());

  async function save() {
    if (!match) return;
    try {
      await api("/api/users/onboard", {
        method: "POST",
        body: { step: "basics", neighborhood: match.name, coarseLat: match.lat, coarseLng: match.lng, travelRadiusKm: radius },
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiCallError ? err.message : "Couldn't save. Try again.");
    }
  }

  return (
    <section className={`${s.card} ${s.stack}`}>
      <h2 className={s.h2}>Where are you based?</h2>
      <label className={s.stack}>
        <span>Neighborhood</span>
        <input className={s.select} list="sf-neighborhoods" value={hood} placeholder="Start typing, e.g. Mission"
          onChange={(e) => setHood(e.target.value)} />
        <datalist id="sf-neighborhoods">{SF_NEIGHBORHOODS.map((n) => <option key={n.name} value={n.name} />)}</datalist>
      </label>
      <label className={s.stack}>
        <span>How far will you travel? <strong>{radius} km</strong></span>
        <input type="range" className={s.range} min={1} max={25} value={radius} onChange={(e) => setRadius(Number(e.target.value))} />
      </label>
      <p className={s.muted}>Others only ever see your neighborhood, never your exact location.</p>
      {error ? <p className={s.error} role="alert">{error}</p> : null}
      <div className={s.row}><Button size="lg" disabled={!match} onClick={save}>Continue</Button></div>
    </section>
  );
}

function Heard({ extracted }: { extracted: ChatResponse["extracted"] }) {
  if (!extracted) return <p className={s.muted}>As you chat, what I pick up shows here.</p>;
  const items = [
    ...extracted.interests.map((i) => i.tag),
    ...extracted.availabilitySlots.map((x) => SLOT_LABEL[x]),
    ...(extracted.groupSizePref ? [GROUP_SIZE_LABEL[extracted.groupSizePref]] : []),
  ];
  return (
    <div className={s.stack}>
      <div className={s.between}><span className={s.h3}>I heard</span><AiTag /></div>
      <div className={s.row}>{items.map((x) => <Chip key={x} label={x} />)}</div>
    </div>
  );
}

function Talk({ onDone }: { onDone: () => void }) {
  const [extracted, setExtracted] = useState<ChatResponse["extracted"]>();
  const [done, setDone] = useState(false);
  const [aiDown, setAiDown] = useState(false);
  const onResponse = (res: ChatResponse) => {
    if (res.extracted) setExtracted(res.extracted);
    if (res.done) setDone(true);
  };
  return (
    <div className={s.split}>
      <ChatPanel kind="onboarding" opener="Tell me a bit about what you'd like more of in your week."
        onResponse={onResponse} onError={(code) => setAiDown(code === "AI_UNAVAILABLE")} />
      <aside className={`${s.card} ${s.stack}`}>
        {aiDown ? (
          <p className={s.muted} role="status">Your agent is unavailable right now. You can fill in your preferences yourself.</p>
        ) : (
          <Heard extracted={extracted} />
        )}
        <Button size="lg" variant={done || aiDown ? "primary" : "secondary"} onClick={onDone} disabled={!extracted && !aiDown}>
          {aiDown ? "Fill in a form instead" : done ? "Review my profile" : "Skip to review"}
        </Button>
      </aside>
    </div>
  );
}

function Review() {
  const router = useRouter();
  const { prefs, error, update } = usePreferences();
  const [consent, setConsent] = useState<Consent>({ ...DEFAULT_CONSENT });
  const [discoverable, setDiscoverable] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function confirm() {
    setSaving(true);
    setSaveError(null);
    try {
      await api("/api/agent/preferences/confirm", { method: "POST", body: { discoverable, consent } });
      router.push("/discover");
    } catch (err) {
      setSaveError(err instanceof ApiCallError ? err.message : "Couldn't save. Try again.");
      setSaving(false);
    }
  }

  if (!prefs) return <p className={error ? s.error : s.muted}>{error ?? "Loading your profile…"}</p>;
  return (
    <div className={s.stack} style={{ gap: "var(--space-6)" }}>
      <section className={`${s.card} ${s.stack}`}>
        <h2 className={s.h2}>Does this look right?</h2>
        <p className={s.muted}>Anything marked AI inferred came from our chat. Remove or change whatever is off.</p>
        {error ? <p className={s.error} role="alert">{error}</p> : null}
        <PreferencesEditor value={prefs} onChange={update} />
      </section>
      <section className={`${s.card} ${s.stack}`}>
        <h2 className={s.h2}>What your agent may share</h2>
        <PermissionsEditor consent={consent} onChange={(p) => setConsent((c) => ({ ...c, ...p }))}
          discoverable={discoverable} onDiscoverableChange={setDiscoverable} />
      </section>
      {saveError ? <p className={s.error} role="alert">{saveError}</p> : null}
      <div className={s.row}><Button size="lg" onClick={confirm} disabled={saving}>Confirm and continue</Button></div>
    </div>
  );
}

/** Screen 1: basics → talk to your agent → review & confirm. */
export function OnboardingFlow() {
  const [step, setStep] = useState<Step>("basics");
  return (
    <main className={`${s.page} ${step === "talk" ? s.wide : ""}`}>
      <Progress step={step} />
      <h1 className={s.lead}>Welcome to CommonGround</h1>
      {step === "basics" ? <Basics onDone={() => setStep("talk")} /> : null}
      {step === "talk" ? <Talk onDone={() => setStep("review")} /> : null}
      {step === "review" ? <Review /> : null}
    </main>
  );
}
