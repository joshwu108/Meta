"use client";
import { useId } from "react";
import { CONSENT_KEYS, type Consent } from "../schemas";
import { Switch } from "./primitives";
import { CONSENT_COPY } from "./labels";
import s from "./agent.module.css";

function SwitchRow({ title, body, checked, onChange, disabled }: {
  title: string; body: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className={s.switchRow}>
      <div>
        <p id={`${id}-t`} style={{ margin: 0, fontWeight: 600 }}>{title}</p>
        <p id={`${id}-d`} className={s.muted}>{body}</p>
      </div>
      <Switch checked={checked} onChange={onChange} labelledBy={`${id}-t`} describedBy={`${id}-d`} disabled={disabled} />
    </div>
  );
}

/** Discoverability (optional) plus the five consent switches. */
export function PermissionsEditor({ consent, onChange, discoverable, onDiscoverableChange, disabled }: {
  consent: Consent;
  onChange: (patch: Partial<Consent>) => void;
  discoverable?: boolean;
  onDiscoverableChange?: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      {onDiscoverableChange ? (
        <SwitchRow title="Let people find me" disabled={disabled}
          body="Others can see your public card (name, photo, bio, neighborhood) in matches. Off hides you from matching."
          checked={discoverable ?? false} onChange={onDiscoverableChange} />
      ) : null}
      {CONSENT_KEYS.map((key) => (
        <SwitchRow key={key} title={CONSENT_COPY[key].title} body={CONSENT_COPY[key].body} disabled={disabled}
          checked={consent[key]} onChange={(v) => onChange({ [key]: v })} />
      ))}
    </div>
  );
}
