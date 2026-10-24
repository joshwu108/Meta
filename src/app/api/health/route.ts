import { ok } from '@/lib/api';

/** Public route: liveness check for deploy previews and Playwright's webServer wait. */
export function GET() {
  return ok({ status: 'ok', time: new Date().toISOString() });
}
