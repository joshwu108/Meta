"use client";
/**
 * Agent UI primitives. Button, AiTag and AiRing are 01's shared components (design-system.md §4),
 * wrapped only to keep ws02 defaults (type="button", "AI inferred"). Chip, ToggleChip and Switch stay
 * local: 01's Chip names every remove button just "Remove", and ws02's consent rows label the
 * switch via aria-labelledby/-describedby (see PROGRESS "Needs from others").
 */
import type { KeyboardEvent, ReactNode } from "react";
import { AiRing as CoreAiRing, AiTag as CoreAiTag, Button as CoreButton, type AiTagLabel, type ButtonProps } from "@/features/core/components/ui";
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

/** Removable chip. Backspace or Delete removes it when focused. */
export function Chip({
  label,
  onRemove,
  inferred,
}: {
  label: string;
  onRemove?: () => void;
  inferred?: boolean;
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (onRemove && (e.key === "Backspace" || e.key === "Delete")) {
      e.preventDefault();
      onRemove();
    }
  };
  return (
    <span className={`${s.chip} ${s.chipSelected}`} tabIndex={onRemove ? 0 : undefined} onKeyDown={onKeyDown}>
      {label}
      {inferred ? <AiTag /> : null}
      {onRemove ? (
        <button type="button" className={s.chipRemove} aria-label={`Remove ${label}`} onClick={onRemove}>
          ×
        </button>
      ) : null}
    </span>
  );
}

/** Toggle chip for multi-select options (availability, goals). */
export function ToggleChip({ label, pressed, onToggle }: { label: string; pressed: boolean; onToggle: () => void }) {
  return (
    <button type="button" className={s.chip} aria-pressed={pressed} onClick={onToggle}>
      {label}
    </button>
  );
}

export function Switch({
  checked,
  onChange,
  labelledBy,
  describedBy,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  labelledBy: string;
  describedBy?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
      className={s.switch}
      onClick={() => onChange(!checked)}
    >
      <span className={s.knob} />
    </button>
  );
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
