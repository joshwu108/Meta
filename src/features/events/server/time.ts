import "server-only";

// Timestamps arrive as ISO strings whose offset depends on the database session time zone,
// so they are always compared as instants, never as text.

export const millis = (iso: string): number => Date.parse(iso);

export const compareInstants = (a: string, b: string): number => millis(a) - millis(b);
