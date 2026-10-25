import "server-only";
import type { EventCategory } from "@/shared/enums";

// Fallback until SharablePreferences carries 02's interest_categories (see PROGRESS.md "Needs from others").
const TAG_CATEGORIES: Readonly<Record<string, EventCategory>> = {
  pottery: "creative", ceramics: "creative", painting: "creative", drawing: "creative", crafts: "creative",
  knitting: "creative", photography: "creative", art: "creative", sketching: "creative",
  coffee: "food_drink", cooking: "food_drink", baking: "food_drink", wine: "food_drink", tea: "food_drink",
  beer: "food_drink", food: "food_drink", "coffee-shops": "food_drink", brunch: "food_drink",
  "board-games": "games", games: "games", trivia: "games", chess: "games", "tabletop-rpg": "games",
  hiking: "outdoors", climbing: "outdoors", camping: "outdoors", gardening: "outdoors", biking: "outdoors",
  yoga: "fitness", running: "fitness", fitness: "fitness", dance: "fitness", pilates: "fitness",
  books: "learning", reading: "learning", languages: "learning", writing: "learning", coding: "learning",
  music: "music", concerts: "music", guitar: "music", singing: "music", jazz: "music", karaoke: "music",
  volunteering: "community", community: "community", meetups: "community",
};

/** Event categories implied by free-form interest tags, in first-seen order, without duplicates. */
export function categoriesForInterests(interests: readonly string[]): EventCategory[] {
  const found = interests
    .map((tag) => TAG_CATEGORIES[tag.trim().toLowerCase()])
    .filter((c): c is EventCategory => c !== undefined);
  return [...new Set(found)];
}
