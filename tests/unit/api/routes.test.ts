import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const runSeed = vi.fn(async () => ({ consumers: 15 }));
vi.mock('@/features/core/server/seed', () => ({ runSeed }));

const { EMPTY_CONTEXT } = await import('@/lib/api');
const { POST: seed } = await import('@/app/api/dev/seed/route');
const { GET: health } = await import('@/app/api/health/route');

describe('GET /api/health', () => {
  it('returns the ok envelope', async () => {
    const body = await health().json();
    expect(body).toMatchObject({ ok: true, data: { status: 'ok' } });
  });
});

describe('POST /api/dev/seed', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    runSeed.mockClear();
  });

  it('runs the seed outside production', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DEMO_MODE', '0');
    const res = await seed(new Request('http://test/api/dev/seed', { method: 'POST' }), EMPTY_CONTEXT);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { consumers: 15 } });
  });

  it('is unreachable in production unless DEMO_MODE=1', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DEMO_MODE', '0');
    const blocked = await seed(new Request('http://test/api/dev/seed', { method: 'POST' }), EMPTY_CONTEXT);
    expect(blocked.status).toBe(404);
    expect(runSeed).not.toHaveBeenCalled();

    vi.stubEnv('DEMO_MODE', '1');
    const allowed = await seed(new Request('http://test/api/dev/seed', { method: 'POST' }), EMPTY_CONTEXT);
    expect(allowed.status).toBe(200);
  });
});
