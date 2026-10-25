/**
 * The neighborhood labels the static geocoder knows (server/geocode.ts). Kept in its own
 * module so the onboarding form can offer them without importing a `server-only` file.
 */
export const NEIGHBORHOOD_LABELS = [
  'Mission',
  'Hayes Valley',
  'North Beach',
  'SoMa',
  'Castro',
  'Richmond',
  'Sunset',
  'Potrero Hill',
] as const;

export type NeighborhoodLabel = (typeof NEIGHBORHOOD_LABELS)[number];
