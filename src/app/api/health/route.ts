import { ok } from '@/lib/api';
import { aiStatus } from '@/lib/ai/status';
import { serverEnv } from '@/lib/env';

/**
 * Public route: liveness check for deploy previews and Playwright's webServer wait.
 * Outside production it also reports whether agent replies are live or fixtures, so a running
 * app can be told apart from a mocked one without reading the server's environment.
 */
export function GET() {
  return ok({
    status: 'ok',
    time: new Date().toISOString(),
    ...(serverEnv.isProduction ? {} : { ai: aiStatus() }),
  });
}
