import { expect, test, type Page } from '@playwright/test';
import { CONSUMER, OWNER, login } from './helpers';

// Whole-app audit: crawl every page each role can reach, then click every non-destructive
// button on it. Collects every finding instead of stopping at the first, so one run lists all
// problems. Runs last (zz-) because it only reads; the scenario specs own the mutating flows.

test.describe.configure({ timeout: 600_000 });

const ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const PER_PATTERN = 2;
const MAX_PAGES = 80;
const MAX_BUTTONS = 40;
// Clicking these changes shared demo data or leaves the session; the scenario specs cover them.
const DESTRUCTIVE = /delete|remove|cancel|block|report|reject|decline|leave|log ?out|sign ?out|publish|approve|complete|send|submit|confirm|rsvp|accept|connect|join|invite|request|generate|mark|save|apply|create|yes,|transfer|archive|vote/i;
const SKIP_PATHS = /^\/(api|dev|_next)\b|^\/(login|signup|onboarding)$/;
const DEAD_TEXT = /isn[’']t available|page not found|this page could not be found|something went wrong|application error/i;

type Finding = { where: string; what: string };

function watch(page: Page, findings: Finding[]): { setWhere: (w: string) => void } {
  let where = 'start';
  const origin = new URL(page.url() === 'about:blank' ? 'http://127.0.0.1' : page.url()).origin;
  page.on('pageerror', (err) => findings.push({ where, what: `uncaught: ${err.message.slice(0, 200)}` }));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (/favicon|Download the React DevTools|Failed to load resource: the server responded with a status of 401/.test(text)) return;
    findings.push({ where, what: `console: ${text.slice(0, 200)}` });
  });
  page.on('response', (res) => {
    const url = new URL(res.url());
    if (url.origin !== new URL(page.url() || origin).origin) return;
    if (res.status() >= 500) findings.push({ where, what: `HTTP ${res.status()} ${url.pathname}` });
  });
  return { setWhere: (w) => (where = w) };
}

const pattern = (path: string) => path.replace(ID, ':id');

async function internalLinks(page: Page): Promise<string[]> {
  const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href') ?? ''));
  return [...new Set(hrefs.filter((h) => h.startsWith('/') && !h.startsWith('//')).map((h) => h.split('#')[0]!.split('?')[0]!))];
}

async function checkPage(page: Page, path: string, findings: Finding[]): Promise<void> {
  const res = await page.goto(path, { waitUntil: 'networkidle' }).catch((err: Error) => {
    findings.push({ where: path, what: `navigation failed: ${err.message.slice(0, 120)}` });
    return null;
  });
  if (res && res.status() >= 400) findings.push({ where: path, what: `document HTTP ${res.status()}` });
  const main = await page.locator('main').first().innerText().catch(() => '');
  if (DEAD_TEXT.test(main)) findings.push({ where: path, what: `dead page text: "${main.match(DEAD_TEXT)?.[0]}"` });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) findings.push({ where: path, what: `horizontal overflow ${overflow}px at ${page.viewportSize()?.width}px` });
}

async function clickButtons(page: Page, path: string, findings: Finding[]): Promise<number> {
  const buttons = page.locator('button:visible:not([disabled]), [role="tab"]:visible, [role="switch"]:visible');
  const names = (await buttons.evaluateAll((els) =>
    els.map((el) => (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ')),
  )).slice(0, MAX_BUTTONS);
  let clicked = 0;
  for (let i = 0; i < names.length; i += 1) {
    const name = names[i]!;
    if (!name || DESTRUCTIVE.test(name)) continue;
    const target = page.locator('button:visible:not([disabled]), [role="tab"]:visible, [role="switch"]:visible').nth(i);
    if ((await target.count()) === 0) continue;
    const before = findings.length;
    await target.click({ timeout: 3_000 }).catch((err: Error) => {
      // A control that cannot be clicked at all is a finding; one that moved after a re-render is not.
      if (!/detached|not attached|intercepts pointer|outside of the viewport/.test(err.message)) {
        findings.push({ where: path, what: `button "${name}" not clickable: ${err.message.split('\n')[0]!.slice(0, 120)}` });
      }
    });
    await page.waitForTimeout(250);
    for (const f of findings.slice(before)) if (!f.what.startsWith('button ')) f.what = `after clicking "${name}": ${f.what}`;
    clicked += 1;
    await page.keyboard.press('Escape').catch(() => undefined);
    if (pattern(new URL(page.url()).pathname) !== pattern(path)) await page.goto(path, { waitUntil: 'networkidle' }).catch(() => undefined);
  }
  return clicked;
}

async function crawl(page: Page, starts: string[], findings: Finding[], label: string): Promise<{ pages: string[]; buttons: number }> {
  const seen = new Map<string, number>();
  const queue = [...starts];
  const visited: string[] = [];
  let buttons = 0;
  const { setWhere } = watch(page, findings);
  while (queue.length > 0 && visited.length < MAX_PAGES) {
    const path = queue.shift()!;
    const key = pattern(path);
    if (SKIP_PATHS.test(path) || (seen.get(key) ?? 0) >= PER_PATTERN || visited.includes(path)) continue;
    seen.set(key, (seen.get(key) ?? 0) + 1);
    setWhere(`${label} ${path}`);
    await checkPage(page, path, findings);
    visited.push(path);
    for (const link of await internalLinks(page)) if (!visited.includes(link)) queue.push(link);
    if (seen.get(key) === 1) buttons += await clickButtons(page, path, findings);
  }
  return { pages: visited, buttons };
}

function report(label: string, result: { pages: string[]; buttons: number }, findings: Finding[]): void {
  test.info().annotations.push({ type: 'audit', description: `${label}: ${result.pages.length} pages, ${result.buttons} buttons clicked, ${findings.length} findings` });
  console.warn(`[ui-audit] ${label}: ${result.pages.length} pages, ${result.buttons} buttons clicked\n  ${result.pages.join('\n  ')}`);
  for (const f of findings) console.warn(`[ui-audit] FINDING ${f.where} :: ${f.what}`);
}

test('consumer: every reachable page and safe button works', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, CONSUMER.email);
  const findings: Finding[] = [];
  const result = await crawl(page, ['/discover', '/events', '/match', '/groups', '/groups/discover', '/activity', '/places', '/agent', '/agent/preferences', '/agent/permissions', '/agent/log'], findings, 'consumer');
  report('consumer', result, findings);
  expect(findings).toEqual([]);
});

test('business owner: every reachable page and safe button works', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, OWNER.email);
  const findings: Finding[] = [];
  const result = await crawl(page, ['/business', '/business/proposals', '/business/events', '/business/events/new', '/business/insights'], findings, 'business');
  report('business', result, findings);
  expect(findings).toEqual([]);
});

test('every consumer page fits a phone without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, CONSUMER.email);
  const findings: Finding[] = [];
  watch(page, findings);
  for (const path of ['/discover', '/events', '/match', '/groups', '/activity', '/places', '/agent']) await checkPage(page, path, findings);
  for (const f of findings) console.warn(`[ui-audit] FINDING mobile ${f.where} :: ${f.what}`);
  expect(findings).toEqual([]);
});

test('signed-out pages load cleanly', async ({ page }) => {
  const findings: Finding[] = [];
  watch(page, findings);
  for (const path of ['/login', '/signup']) await checkPage(page, path, findings);
  for (const f of findings) console.warn(`[ui-audit] FINDING signed-out ${f.where} :: ${f.what}`);
  expect(findings).toEqual([]);
});
