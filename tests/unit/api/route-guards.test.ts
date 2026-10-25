import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every Route Handler is wrapped in `withAuth` unless a comment marks it public (specs/README §4).
 * Reviews catch this most of the time; this catches it the rest of the time, including for a route
 * added by a workstream that never reads 01's spec.
 */

const API_DIR = path.join('src', 'app', 'api');

/** Wrappers that authenticate the caller before the handler body runs. */
const AUTHENTICATED = ['withAuth', 'withBusinessOwner', 'eventRoute', 'businessRoute'];

/**
 * Routes that answer without a session, each for a stated reason. Adding to this list is a
 * deliberate act: everything here is reachable by anyone who can reach the deployment.
 */
const PUBLIC: Readonly<Record<string, string>> = {
  'health/route.ts': 'liveness probe, returns a constant',
  'cron/opportunities/route.ts': 'Vercel Cron; guarded by the OPPORTUNITY_CRON_SECRET bearer token',
  'dev/seed/route.ts': 'refuses unless NODE_ENV is not production or DEMO_MODE=1',
};

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.name === 'route.ts' ? [full] : [];
  });
}

const HANDLER = /export const (GET|POST|PATCH|PUT|DELETE)\b/g;

describe('API route guards', () => {
  const files = routeFiles(API_DIR);

  it('finds the route handlers', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('wraps every handler in a guard, or declares the route public on purpose', () => {
    const unguarded: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const relative = path.relative(API_DIR, file);
      if (relative in PUBLIC) continue;
      const handlers = source.match(HANDLER) ?? [];
      if (handlers.length === 0) continue;
      if (!AUTHENTICATED.some((guard) => source.includes(guard))) unguarded.push(relative);
    }
    expect(
      unguarded,
      `no auth wrapper, and not declared public: ${unguarded.join(', ')}`,
    ).toEqual([]);
  });

  it('keeps the public list honest — every entry still exists and still opts out', () => {
    for (const [relative, reason] of Object.entries(PUBLIC)) {
      const file = path.join(API_DIR, relative);
      const source = readFileSync(file, 'utf8');
      expect(reason.length, `${relative} needs a reason`).toBeGreaterThan(10);
      // A route that has since been given a session guard should leave this list.
      const stillPublic = !AUTHENTICATED.some((guard) => source.includes(guard));
      expect(stillPublic, `${relative} is guarded now; drop it from PUBLIC`).toBe(true);
    }
  });
});
