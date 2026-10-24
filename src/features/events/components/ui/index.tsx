import { Sparkles } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import s from "./ui.module.css";

// Minimal stand-ins for 01's primitives; same names and props so imports swap cleanly.

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "lg";
};

/** Button classes, also used to style links that act as buttons. */
export function buttonClass(variant: NonNullable<ButtonProps["variant"]> = "primary", size: ButtonProps["size"] = "md"): string {
  return [s.button, s[variant], size === "lg" ? s.large : ""].join(" ").trim();
}

export function Button({ variant = "primary", size = "md", className, ...rest }: ButtonProps) {
  return <button type="button" className={`${buttonClass(variant, size)} ${className ?? ""}`.trim()} {...rest} />;
}

export function AiTag({ children = "AI suggestion" }: { children?: ReactNode }) {
  return (
    <span className={s.aiTag}>
      <Sparkles size={12} strokeWidth={1.75} aria-hidden />
      {children}
    </span>
  );
}

export function AiRing({ children }: { children: ReactNode }) {
  return <span className={s.aiRing}>{children}</span>;
}

export function Avatar({ name, src, size = 32 }: { name: string; src?: string | null; size?: 24 | 32 | 40 | 56 }) {
  const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span className={s.avatar} style={{ width: size, height: size, fontSize: size * 0.4 }} title={name}>
      {src ? <img src={src} alt="" /> : initials || "?"}
    </span>
  );
}

export function AvatarStack({ people, size = 24 }: { people: Array<{ userId: string; displayName: string; avatarUrl: string | null }>; size?: 24 | 32 }) {
  return (
    <span className={s.stack}>
      {people.slice(0, 4).map((p) => <Avatar key={p.userId} name={p.displayName} src={p.avatarUrl} size={size} />)}
    </span>
  );
}

export function CapacityMeter({ confirmed, capacity }: { confirmed: number; capacity: number }) {
  const ratio = capacity > 0 ? Math.min(1, confirmed / capacity) : 1;
  const tone = ratio >= 1 ? s.fillFull : ratio >= 0.8 ? s.fillWarn : "";
  return (
    <div className={s.meter}>
      <span>{confirmed} of {capacity} spots</span>
      <div className={s.track} role="meter" aria-valuemin={0} aria-valuemax={capacity} aria-valuenow={confirmed} aria-label="Spots taken">
        <div className={`${s.fill} ${tone}`} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

const PILL_TONE: Record<string, string> = {
  published: "pillGreen", confirmed: "pillGreen", completed: "pillGray", full: "pillBlue",
  waitlisted: "pillAmber", reconfirm: "pillAmber", cancelled: "pillRed",
};
const PILL_LABEL: Record<string, string> = { reconfirm: "Needs reconfirm" };

export function StatusPill({ status }: { status: string }) {
  const label = PILL_LABEL[status] ?? status.charAt(0).toUpperCase() + status.slice(1).replace("_", " ");
  return <span className={`${s.pill} ${s[PILL_TONE[status] ?? "pillGray"]}`}>{label}</span>;
}

export function EmptyState({ icon, text, action }: { icon: ReactNode; text: string; action?: ReactNode }) {
  return (
    <div className={s.empty}>
      {icon}
      <p style={{ margin: 0 }}>{text}</p>
      {action}
    </div>
  );
}

export function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={s.switchRow}>
      <span>{label}</span>
      <span className={s.switch}>
        <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className={s.switchTrack} />
      </span>
    </label>
  );
}
