"use client";
import { useState, type FormEvent } from "react";
import { AVAILABILITY_SLOT, GROUP_SIZE_PREF, SOCIAL_GOAL } from "@/shared/enums";
import type { PreferenceField, UserPreferencesPatch, UserPreferencesWithSources } from "../schemas";
import { Chip, ToggleChip, Button } from "./primitives";
import { GOAL_LABEL, GROUP_SIZE_LABEL, SLOT_LABEL } from "./labels";
import s from "./agent.module.css";

type Props = {
  value: UserPreferencesWithSources;
  /** Called with only the touched fields; the server marks them `user_set`. */
  onChange: (patch: UserPreferencesPatch) => void;
};

const toggle = <T,>(list: readonly T[], item: T): T[] =>
  list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

function TagField({
  label, field, value, onChange,
}: { label: string; field: "interests" | "activityPrefs"; value: UserPreferencesWithSources; onChange: Props["onChange"] }) {
  const [draft, setDraft] = useState("");
  const inferred = value.fieldSources[field] === "ai_inferred";
  const add = (e: FormEvent) => {
    e.preventDefault();
    const tag = draft.trim();
    if (!tag) return;
    setDraft("");
    onChange({ [field]: [...value[field], tag] });
  };
  return (
    <fieldset className={s.stack} style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className={s.h3}>{label}</legend>
      <div className={s.row}>
        {value[field].length === 0 ? <span className={s.muted}>None yet</span> : null}
        {value[field].map((tag) => (
          <Chip key={tag} label={tag} inferred={inferred} onRemove={() => onChange({ [field]: value[field].filter((t) => t !== tag) })} />
        ))}
      </div>
      <form className={s.composer} onSubmit={add}>
        <input className={s.input} aria-label={`Add to ${label}`} value={draft} maxLength={40}
          placeholder="Add one" onChange={(e) => setDraft(e.target.value)} />
        <Button variant="secondary" type="submit" disabled={!draft.trim()}>Add</Button>
      </form>
    </fieldset>
  );
}

function Section({ title, field, value, children }: {
  title: string; field: PreferenceField; value: UserPreferencesWithSources; children: React.ReactNode;
}) {
  const inferred = value.fieldSources[field] === "ai_inferred";
  return (
    <fieldset className={s.stack} style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className={s.between} style={{ width: "100%" }}>
        <span className={s.h3}>{title}</span>
        {inferred ? <span className={s.muted}>AI inferred, tap to change</span> : null}
      </legend>
      {children}
    </fieldset>
  );
}

/** Structured editor for every preference field (review step and /agent/preferences). */
export function PreferencesEditor({ value, onChange }: Props) {
  const budgetDollars = value.budgetMaxCents == null ? null : Math.round(value.budgetMaxCents / 100);
  return (
    <div className={s.stack} style={{ gap: "var(--space-6)" }}>
      <TagField label="Interests" field="interests" value={value} onChange={onChange} />
      <Section title="When you're free" field="availabilitySlots" value={value}>
        <div className={s.slotGrid}>
          {AVAILABILITY_SLOT.map((slot) => (
            <ToggleChip key={slot} label={SLOT_LABEL[slot]} pressed={value.availabilitySlots.includes(slot)}
              onToggle={() => onChange({ availabilitySlots: toggle(value.availabilitySlots, slot) })} />
          ))}
        </div>
      </Section>
      <Section title="Group size" field="groupSizePref" value={value}>
        <div className={s.radioGroup} role="radiogroup" aria-label="Group size">
          {GROUP_SIZE_PREF.map((size) => (
            <button key={size} type="button" role="radio" aria-checked={value.groupSizePref === size} className={s.chip}
              onClick={() => onChange({ groupSizePref: value.groupSizePref === size ? null : size })}>
              {GROUP_SIZE_LABEL[size]}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Social goals" field="socialGoals" value={value}>
        <div className={s.row}>
          {SOCIAL_GOAL.map((goal) => (
            <ToggleChip key={goal} label={GOAL_LABEL[goal]} pressed={value.socialGoals.includes(goal)}
              onToggle={() => onChange({ socialGoals: toggle(value.socialGoals, goal) })} />
          ))}
        </div>
      </Section>
      <Section title="Budget per event" field="budgetMaxCents" value={value}>
        <label className={s.between}>
          <span className={s.muted}>{budgetDollars == null ? "No limit set" : `Up to $${budgetDollars}`}</span>
          {budgetDollars != null ? (
            <Button variant="ghost" onClick={() => onChange({ budgetMaxCents: null })}>Clear</Button>
          ) : null}
        </label>
        <input type="range" className={s.range} min={0} max={100} step={5} aria-label="Maximum budget in dollars"
          value={budgetDollars ?? 0}
          onChange={(e) => onChange({ budgetMaxCents: Number(e.target.value) * 100, budgetMinCents: null })} />
      </Section>
      <Section title="Travel radius" field="travelRadiusKm" value={value}>
        <span className={s.muted}>{value.travelRadiusKm} km</span>
        <input type="range" className={s.range} min={1} max={25} step={1} aria-label="Travel radius in kilometers"
          value={value.travelRadiusKm} onChange={(e) => onChange({ travelRadiusKm: Number(e.target.value) })} />
      </Section>
      <TagField label="Activity style" field="activityPrefs" value={value} onChange={onChange} />
    </div>
  );
}
