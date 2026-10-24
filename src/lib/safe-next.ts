/**
 * Sanitise a `next` redirect target so it can only point inside this app.
 * Rejects absolute URLs, protocol-relative `//host`, and backslash tricks like `/\evil.com`
 * (browsers treat `\` as `/`). Returns `fallback` for anything unsafe.
 */
export function safeNext(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string' || value.includes('\\') || !/^\/(?!\/)/.test(value)) return fallback;
  let url: URL;
  try {
    url = new URL(value, 'http://local.invalid');
  } catch {
    return fallback;
  }
  if (url.origin !== 'http://local.invalid') return fallback;
  return `${url.pathname}${url.search}`;
}
