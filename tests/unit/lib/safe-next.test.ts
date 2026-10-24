import { describe, expect, it } from 'vitest';
import { safeNext } from '@/lib/safe-next';

describe('safeNext', () => {
  it('keeps in-app paths with query strings', () => {
    expect(safeNext('/events')).toBe('/events');
    expect(safeNext('/events/1?tab=going')).toBe('/events/1?tab=going');
  });

  it('rejects external and malformed targets', () => {
    for (const bad of ['https://evil.com', '//evil.com', '/\\evil.com', '\\evil.com', '/\\\\evil.com', 'evil.com', '', null, undefined, 42, '/a\\b']) {
      expect(safeNext(bad)).toBe('/');
    }
    expect(safeNext('//evil.com', '/discover')).toBe('/discover');
  });

  it('drops fragments and resolves dot segments inside the app', () => {
    expect(safeNext('/a/../b#frag')).toBe('/b');
  });
});
