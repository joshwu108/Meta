import { Coffee, Dices, Dumbbell, GraduationCap, Mountain, Music, Palette, Users, type LucideIcon } from "lucide-react";
import type { EventCategory } from "@/shared/enums";
import s from "./events.module.css";

const ICONS: Record<EventCategory, LucideIcon> = {
  creative: Palette, food_drink: Coffee, games: Dices, outdoors: Mountain,
  fitness: Dumbbell, learning: GraduationCap, music: Music, community: Users,
};

/** 16:9 cover (2:1 on the lead card) with a category-icon placeholder when there is no image. */
export function EventCover({ imageUrl, category, lead = false }: { imageUrl: string | null; category: EventCategory; lead?: boolean }) {
  const Icon = ICONS[category];
  return (
    <div className={`${s.cover} ${lead ? s.coverLead : ""}`}>
      <Icon size={lead ? 40 : 24} strokeWidth={1.75} aria-hidden />
      {imageUrl ? <img src={imageUrl} alt="" /> : null}
    </div>
  );
}
