/**
 * One line of context before the suite runs. `next dev` compiles routes on first request and
 * crashes renders in its dev-only RSC runtime, so a dev-mode pass is slower, flakier, and — the
 * reason this warning exists — can be green while the product is broken on a build: 06's
 * follow-up card left both buttons disabled after Accept on `next start`, and its e2e test passed
 * in dev the whole time. CI always runs the built server.
 */
export default function announceServerMode(): void {
  const prod = Boolean(process.env.CI) || process.env.E2E_SERVER === 'prod';
  if (prod) return;
  console.warn(
    '\n  e2e: running against `next dev`. Good for iterating on one spec; not authoritative —\n' +
      '  a dev pass can be green while a production build is broken. Use `pnpm test:e2e:prod`\n' +
      '  before trusting a green run.\n',
  );
}
