import { EVENT_CATEGORY } from "@/shared/enums";
import { buttonClass } from "./local-ui";
import s from "./events.module.css";

const LABELS: Record<string, string> = {
  creative: "Creative", food_drink: "Food & drink", games: "Games", outdoors: "Outdoors",
  fitness: "Fitness", learning: "Learning", music: "Music", community: "Community",
};
const DISTANCES = [1, 3, 5, 10];

export type FilterValues = { tab: string; category?: string; radiusKm?: number };

/**
 * Plain GET form so filters work without client JavaScript.
 *
 * `/events` renders this twice — once in the right rail, once below the feed for narrow screens —
 * and CSS hides whichever does not belong at that width. Both copies stay in the DOM, so the field
 * ids have to differ: duplicates are invalid HTML, and a `<label for>` binds to the first match in
 * document order, which left the *visible* select with no accessible name at all.
 */
export function EventFilters({ values, instance }: { values: FilterValues; instance: string }) {
  const categoryId = `filter-category-${instance}`;
  const distanceId = `filter-distance-${instance}`;
  return (
    <form method="get" action="/events" className={`${s.card} ${s.filterRow}`} aria-label="Filter events">
      <input type="hidden" name="tab" value={values.tab === "for-you" ? "all" : values.tab} />
      <div className={s.field}>
        <label htmlFor={categoryId} className={s.meta}>Category</label>
        <select id={categoryId} name="category" defaultValue={values.category ?? ""} className={s.select}>
          <option value="">Any category</option>
          {EVENT_CATEGORY.map((c) => <option key={c} value={c}>{LABELS[c]}</option>)}
        </select>
      </div>
      <div className={s.field}>
        <label htmlFor={distanceId} className={s.meta}>Distance</label>
        <select id={distanceId} name="radiusKm" defaultValue={values.radiusKm ? String(values.radiusKm) : ""} className={s.select}>
          <option value="">Any distance</option>
          {DISTANCES.map((d) => <option key={d} value={d}>Within {d} km</option>)}
        </select>
      </div>
      <button type="submit" className={buttonClass("secondary")}>Apply filters</button>
    </form>
  );
}
