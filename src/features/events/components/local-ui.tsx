import type { ReactNode } from "react";
import { CapacityMeter } from "@/features/core/components/ui";
import s from "./local-ui.module.css";

/** Classes for a Link that acts as a button (01's Button renders a <button>). */
export function buttonClass(variant: "primary" | "secondary" = "primary"): string {
  return `${s.button} ${s[variant]}`;
}

/** Status labels 01's StatusPill has no tone for: "Needs reconfirm" (amber) and "New" (blue). */
export function Pill({ tone, children }: { tone: "warning" | "brand"; children: ReactNode }) {
  return <span className={`${s.pill} ${s[tone]}`}>{children}</span>;
}

/** 01's capacity meter with spec 06's "7 of 10 spots" label. */
export function SpotsMeter({ confirmed, capacity }: { confirmed: number; capacity: number }) {
  return (
    <div className={s.meter}>
      <span>{confirmed} of {capacity} spots</span>
      <CapacityMeter confirmed={confirmed} capacity={capacity} showLabel={false} />
    </div>
  );
}
