import { EVENT_CATEGORY } from "@/shared/enums";
import { buttonClass } from "./ui";
import s from "./events.module.css";

const LABELS: Record<string, string> = {
  creative: "Creative", food_drink: "Food & drink", games: "Games", outdoors: "Outdoors",
  fitness: "Fitness", learning: "Learning", music: "Music", community: "Community",
};
const DISTANCES = [1, 3, 5, 10];

export type FilterValues = { tab: string; category?: string; radiusKm?: number };

/** Plain GET form so filters work without client JavaScript; lives in the right rail at ≥1024px. */
export function EventFilters({ values }: { values: FilterValues }) {
  return (
    <form method="get" action="/events" className={s.card} aria-label="Filter events">
      <input type="hidden" name="tab" value={values.tab === "for-you" ? "all" : values.tab} />
      <div className={s.field}>
        <label htmlFor="filter-category" className={s.meta}>Category</label>
        <select id="filter-category" name="category" defaultValue={values.category ?? ""} className={s.select}>
          <option value="">Any category</option>
          {EVENT_CATEGORY.map((c) => <option key={c} value={c}>{LABELS[c]}</option>)}
        </select>
      </div>
      <div className={s.field}>
        <label htmlFor="filter-distance" className={s.meta}>Distance</label>
        <select id="filter-distance" name="radiusKm" defaultValue={values.radiusKm ? String(values.radiusKm) : ""} className={s.select}>
          <option value="">Any distance</option>
          {DISTANCES.map((d) => <option key={d} value={d}>Within {d} km</option>)}
        </select>
      </div>
      <button type="submit" className={buttonClass("secondary")}>Apply filters</button>
    </form>
  );
}
