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
import { ImportFlow } from "@/features/import/components/import-flow";
import { SF_NEIGHBORHOODS, SLOT_LABEL, GROUP_SIZE_LABEL, matchNeighborhood } from "./labels";
import s from "./agent.module.css";

type Step = "basics" | "talk" | "import" | "review";

function Progress({ step, steps }: { step: Step; steps: Step[] }) {
  const at = steps.indexOf(step);
  return (
    <ol className={s.steps} aria-label={`Step ${at + 1} of ${steps.length}`}>
      {steps.map((x, i) => <li key={x} className={`${s.step} ${i <= at ? s.stepDone : ""}`} />)}
    </ol>
  );
}

/** Optional 07 step between Talk and Review. Skip (first in tab order) goes to Review unchanged. */
function ImportStep({ onDone }: { onDone: () => void }) {
  return (
    <div className={s.stack}>
      <section className={`${s.card} ${s.stack}`}>
        <h2 className={s.h2}>Want help finding more?</h2>
        <p className={s.muted}>Bring in your Instagram taste from a screenshot you choose. Nothing is added unless you tap it.</p>
        <div className={s.row}><Button variant="secondary" onClick={onDone}>Skip</Button></div>
      </section>
      <ImportFlow after={() => <div className={s.row}><Button size="lg" onClick={onDone}>Back to review</Button></div>} />
    </div>
  );
}

function Basics({ onDone }: { onDone: () => void }) {
  const [hood, setHood] = useState("");
  const [radius, setRadius] = useState(5);
  const [error, setError] = useState<string | null>(null);
  const match = matchNeighborhood(hood);

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
      {hood.trim() && !match ? <p className={s.muted} role="status">Pick a neighborhood from the list</p> : null}
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

function Talk({ onDone, onImport }: { onDone: () => void; onImport?: () => void }) {
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
        {onImport && !aiDown ? <Button variant="secondary" onClick={onImport}>Bring in your Instagram taste</Button> : null}
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

/**
 * Screen 1: basics → talk to your agent → (optional, 07) bring in Instagram taste → review & confirm.
 * `displayName` greets the signed-in user; `importEnabled` adds the optional step.
 */
export function OnboardingFlow({ displayName, importEnabled = false }: { displayName?: string; importEnabled?: boolean }) {
  const [step, setStep] = useState<Step>("basics");
  const steps: Step[] = step === "import" ? ["basics", "talk", "import", "review"] : ["basics", "talk", "review"];
  return (
    <main className={`${s.page} ${step === "talk" || step === "import" ? s.wide : ""}`}>
      <Progress step={step} steps={steps} />
      <h1 className={s.lead}>{displayName ? `Hi ${displayName}, welcome to Weave` : "Welcome to Weave"}</h1>
      {step === "basics" ? <Basics onDone={() => setStep("talk")} /> : null}
      {step === "talk" ? (
        <Talk onDone={() => setStep("review")} onImport={importEnabled ? () => setStep("import") : undefined} />
      ) : null}
      {step === "import" ? <ImportStep onDone={() => setStep("review")} /> : null}
      {step === "review" ? <Review /> : null}
    </main>
  );
}
