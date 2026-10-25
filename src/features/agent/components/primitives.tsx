"use client";
/**
 * Agent UI primitives: thin wrappers over 01's shared components (design-system.md §4) that keep
 * ws02's call sites and defaults (type="button", "AI inferred", "Remove <label>" chip buttons,
 * consent switches labelled by their row).
 */
import type { ReactNode } from "react";
import {
  AiRing as CoreAiRing,
  AiTag as CoreAiTag,
  Button as CoreButton,
  Chip as CoreChip,
  Switch as CoreSwitch,
  type AiTagLabel,
  type ButtonProps,
} from "@/features/core/components/ui";
import s from "./agent.module.css";

export function Button({ type = "button", ...rest }: ButtonProps) {
  return <CoreButton type={type} {...rest} />;
}

export function AiTag({ label = "AI inferred" }: { label?: AiTagLabel }) {
  return <CoreAiTag label={label} />;
}

export function AiRing({ children }: { children: ReactNode }) {
  return <CoreAiRing>{children}</CoreAiRing>;
}

/** Removable chip on 01's Chip: Backspace/Delete or ✕ removes it, and the button is named "Remove <label>". */
export function Chip({ label, onRemove, inferred }: { label: string; onRemove?: () => void; inferred?: boolean }) {
  return (
    <CoreChip label={label} selected onRemove={onRemove}>
      {label}
      {inferred ? <AiTag /> : null}
    </CoreChip>
  );
}

/** Toggle chip for multi-select options (availability, goals): a pressed button on 01's Chip. */
export function ToggleChip({ label, pressed, onToggle }: { label: string; pressed: boolean; onToggle: () => void }) {
  return <CoreChip selected={pressed} onSelect={onToggle}>{label}</CoreChip>;
}

/** Consent switch on 01's Switch, labelled and described by the row's own text. */
export function Switch({ checked, onChange, labelledBy, describedBy, disabled }: {
  checked: boolean; onChange: (next: boolean) => void; labelledBy: string; describedBy?: string; disabled?: boolean;
}) {
  return <CoreSwitch checked={checked} onChange={onChange} labelledBy={labelledBy} describedBy={describedBy} disabled={disabled} />;
}

export function AgentAvatar() {
  return (
    <AiRing>
      <span className={s.avatar} aria-hidden>
        ✦
      </span>
    </AiRing>
  );
}
