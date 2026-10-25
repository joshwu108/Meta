import 'server-only';

/**
 * Guard for the dev-only routes under `/api/dev` (spec section 11).
 *
 * Two conditions, both required:
 *   1. `ENABLE_DEV_ROUTES=1` has to be set deliberately. It is not in `.env.example`'s
 *      deployment section and nothing sets it by default, so a normal build has no dev
 *      routes at all.
 *   2. The deployment must not be a production one. `VERCEL_ENV` is set by Vercel on every
 *      deployment, so even if the flag were switched on in the project settings by
 *      mistake, production still refuses.
 *
 * `NODE_ENV` alone is not enough: it is `production` for a local `next build && next start`
 * too, which is how the Playwright suite runs.
 */
export const devRoutesEnabled = (): boolean =>
  process.env.ENABLE_DEV_ROUTES === '1' && process.env.VERCEL_ENV !== 'production';
