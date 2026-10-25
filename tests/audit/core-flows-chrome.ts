/**
 * Core-flow walk in real Google Chrome (not bundled Chromium), driving the running dev server the
 * way a person would. The Playwright suite proves behaviour; this proves the product actually
 * works in the browser people use, and leaves screenshots to look at.
 *
 *   MOCK_AI=1 DEMO_MODE=1 ENABLE_DEV_ROUTES=1 SEED_SCALE=0 pnpm dev -p 3100 &
 *   pnpm tsx tests/audit/core-flows-chrome.ts
 *   kill %1
 */
import { chromium, type Locator, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const BASE = process.env.AUDIT_BASE_URL ?? 'http://127.0.0.1:3100';
const SHOTS = process.env.AUDIT_SHOT_DIR ?? '/tmp/weave-audit';
const PASSWORD = 'demo-pass-1234';

type Step = { name: string; ok: boolean; detail?: string };
const steps: Step[] = [];

function record(name: string, ok: boolean, detail?: string): void {
  steps.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Runs one step and reports it; a thrown error is a failed step, not the end of the walk. */
async function step(name: string, body: () => Promise<string | void>): Promise<void> {
  try {
    const detail = await body();
    record(name, true, detail ?? undefined);
  } catch (error) {
    record(name, false, (error as Error).message.split('\n')[0]);
  }
}

/**
 * Fill a React-controlled field and make sure the value survived. Pages here are opened on
 * `domcontentloaded`, so a fill can land before hydration, after which React restores its own
 * empty state and the submit button stays disabled.
 */
async function typeInto(field: Locator, text: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await field.fill(text);
    if ((await field.inputValue()) === text) return;
    await field.page().waitForTimeout(250);
  }
  throw new Error('the field would not hold its value (hydration?)');
}

async function shoot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email').waitFor({ timeout: 30_000 });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  // `/` is a redirect hop, not a destination: it routes by session and onboarding state. Waiting
  // only for "not /login" catches that hop and reads the wrong landing page.
  await page.waitForURL(
    (url) => !url.pathname.startsWith('/login') && url.pathname !== '/',
    { timeout: 30_000 },
  );
}

/**
 * Fails the walk on any uncaught page error or console error, which a screenshot would hide.
 *
 * Two kinds are set aside. Chrome's own fetches (favicon, autofill probes) are not the product's
 * errors. And Chrome — unlike the bundled Chromium the Playwright suite runs, which stays clean
 * across every spec — writes a `style` attribute onto form fields before React hydrates, which
 * React then reports as a hydration mismatch on `style={{}}` for an input our markup never styles.
 * That is the browser editing the page, not our HTML disagreeing with itself, so it is collected
 * separately and reported rather than failing the run.
 */
function watch(page: Page): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/favicon|DevTools|ERR_SSL_PROTOCOL_ERROR|status of 404/.test(text)) return;
    const entry = `[${page.url()}] ${text.slice(0, 200)}`;
    if (/A tree hydrated but some attributes/.test(text)) warnings.push(entry);
    else errors.push(entry);
  });
  return { errors, warnings };
}

async function main(): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.AUDIT_HEADED !== '1' });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const { errors, warnings } = watch(page);

  try {
    // Seeding is best-effort: the dataset may already be in place, and a failed reseed should
    // not hide whether the product works.
    const reseed = await page.request.post(`${BASE}/api/dev/seed`).catch(() => null);
    record('seed the demo dataset', reseed?.ok() ?? false, `HTTP ${reseed?.status() ?? 'no response'}`);

    await login(page, 'maya@weave.test');
    record('sign in as a seeded member', page.url().includes('/discover'), page.url());
    await shoot(page, '01-discover');

    // --- agents talking to agents: the agent explains who it found and why ---------------
    await step('match cards carry an agent explanation', async () => {
      await page.goto(`${BASE}/match`, { waitUntil: 'domcontentloaded' });
      const firstCard = page.getByRole('article').first();
      await firstCard.waitFor({ timeout: 20_000 });
      const explanation = (await firstCard.innerText()).trim();
      if (explanation.length <= 20) throw new Error('no explanation on the first card');
      await shoot(page, '02-match');
      return explanation.split('\n').slice(0, 2).join(' / ');
    });

    // --- the graph: who you are connected to and what formed it --------------------------
    await step('the graph draws the viewer and their people', async () => {
      await page.goto(`${BASE}/graph`, { waitUntil: 'domcontentloaded' });
      const canvas = page.getByRole('img', { name: /Your graph:/ });
      await canvas.waitFor({ timeout: 20_000 });
      const nodes = await canvas.getByRole('button').count();
      if (nodes <= 1) throw new Error(`only ${nodes} node(s) drawn`);
      await shoot(page, '03-graph');
      return `${nodes} nodes`;
    });

    // --- agent chat: a real conversation with the personal agent -------------------------
    await step('the agent answers in chat', async () => {
      await page.goto(`${BASE}/agent`, { waitUntil: 'load' });
      const chat = page.getByRole('region', { name: 'Chat with your agent' });
      const composer = chat.getByPlaceholder('Message your agent');
      await composer.waitFor({ timeout: 20_000 });
      const send = chat.getByRole('button', { name: /^Send$/ });
      const before = await chat.getByRole('article').count();
      await typeInto(composer, 'What should I do this weekend?');
      try {
        await send.click({ timeout: 15_000 });
      } catch {
        throw new Error(
          `Send stayed disabled (draft=${JSON.stringify(await composer.inputValue())}, ` +
            `enabled=${await send.isEnabled()})`,
        );
      }
      await page
        .waitForFunction(
          ([selector, previous]) =>
            document.querySelectorAll(selector as string).length > (previous as number),
          ['section[aria-label="Chat with your agent"] article', before] as const,
          { timeout: 30_000 },
        )
        .catch(() => undefined);
      const replyText = (await chat.getByRole('article').last().innerText()).trim();
      await shoot(page, '04-agent');
      if (replyText.length <= 10) throw new Error('the agent said nothing');
      return replyText.slice(0, 80);
    });

    // --- events generated from demand, seen by a member ----------------------------------
    await step('published events reach the feed', async () => {
      // `/events` opens on the personalised tab, which is empty for a member the matcher has
      // nothing for yet; the published catalogue lives under ?tab=all.
      await page.goto(`${BASE}/events?tab=all`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { level: 3 }).first().waitFor({ timeout: 20_000 });
      const eventHeadings = await page.getByRole('heading', { level: 3 }).count();
      if (eventHeadings === 0) throw new Error('no events in the feed');
      await shoot(page, '05-events');
      return `${eventHeadings} events`;
    });

    // --- the business side of the same data ----------------------------------------------
    await step('a venue owner sees their proposal inbox', async () => {
      await context.clearCookies();
      await login(page, 'owner.kiln-and-cup@weave.test');
      await page.goto(`${BASE}/business/proposals`, { waitUntil: 'domcontentloaded' });
      // The page ships a skeleton first; asserting before it resolves passes on grey boxes.
      const heading = page.getByRole('heading', { level: 1 });
      await heading.waitFor({ timeout: 30_000 });
      await page
        .locator('main')
        .getByText(/Loading/i)
        .first()
        .waitFor({ state: 'detached', timeout: 30_000 })
        .catch(() => undefined);
      const main = (await page.locator('main').innerText()).trim();
      await shoot(page, '06-business-proposals');
      if (/^loading/i.test(main)) throw new Error('still showing the loading skeleton');
      if (main.length === 0) throw new Error('the inbox rendered empty');
      return `${await heading.innerText()} — ${main.split('\n').length} lines`;
    });

    record('no page or console errors during the walk', errors.length === 0, errors.slice(0, 3).join(' | '));
    if (warnings.length > 0) {
      console.log(`\nNOTE  ${warnings.length} browser-origin hydration warning(s), Chrome only:`);
      console.log(`      ${warnings[0]}`);
    }
  } finally {
    await browser.close();
  }

  const failed = steps.filter((step) => !step.ok);
  console.log(`\n${steps.length - failed.length}/${steps.length} steps passed. Screenshots in ${SHOTS}`);
  if (failed.length > 0) process.exitCode = 1;
}

void main();
