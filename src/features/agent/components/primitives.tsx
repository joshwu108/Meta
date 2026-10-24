"use client";
/**
 * Local stand-ins for 01's ui/ primitives (Button, Chip, AiTag, AiRing, Switch).
 * Same props and look as design-system.md; swap for `@/features/core` when it lands.
 */
import type { ButtonHTMLAttributes, KeyboardEvent, ReactNode } from "react";
import s from "./agent.module.css";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "md" | "lg";
};

export function Button({ variant = "primary", size = "md", className, ...rest }: ButtonProps) {
  const classes = [s.button, s[variant], size === "lg" ? s.large : "", className ?? ""].join(" ");
  return <button type="button" className={classes} {...rest} />;
}

export function AiTag({ label = "AI inferred" }: { label?: "AI inferred" | "AI suggestion" | "Estimate" }) {
  return (
    <span className={s.aiTag}>
      <span className={s.aiGlyph} aria-hidden />
      {label}
    </span>
  );
}

export function AiRing({ children }: { children: ReactNode }) {
  return <span className={s.aiRing}>{children}</span>;
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
