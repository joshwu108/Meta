/** Joins class names, dropping anything falsy. Keeps components free of template noise. */
export const cn = (...parts: (string | false | null | undefined)[]): string =>
  parts.filter(Boolean).join(' ');
