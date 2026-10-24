import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const getUser = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(async () => ({ auth: { getUser } })),
}));

const { ApiError, EMPTY_CONTEXT, toErrorResponse, withAuth, withPublic } = await import('@/lib/api');

describe('withAuth', () => {
  beforeEach(() => getUser.mockReset());

  it('returns UNAUTHENTICATED when there is no session', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const handler = withAuth(async () => new Response('never'));
    const res = await handler(new Request('http://test/api/me'), EMPTY_CONTEXT);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
  });

  it('injects user, supabase and resolved params', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    const handler = withAuth(async (ctx, _req, params) => Response.json({ id: ctx.user.id, params, hasClient: Boolean(ctx.supabase), rid: ctx.requestId }));
    const res = await handler(new Request('http://test/api/x/1'), { params: Promise.resolve({ id: '1' }) });
    const body = await res.json();
    expect(body).toMatchObject({ id: 'u1', params: { id: '1' }, hasClient: true });
    expect(body.rid).toMatch(/[0-9a-f-]{36}/);
  });

  it('converts ApiError into the envelope with its status', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    const handler = withAuth(async () => {
      throw new ApiError('NOT_FOUND', 'missing');
    });
    const res = await handler(new Request('http://test/api'), EMPTY_CONTEXT);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: { code: 'NOT_FOUND', message: 'missing' } });
  });

  it('converts ZodError into VALIDATION with field paths', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    const handler = withAuth(async () => {
      z.object({ a: z.number() }).parse({ a: 'x' });
      return new Response();
    });
    const res = await handler(new Request('http://test/api'), EMPTY_CONTEXT);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'VALIDATION', details: [{ path: 'a' }] } });
  });

  it('hides unknown error messages behind INTERNAL and a request id', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    const handler = withAuth(async () => {
      throw new Error('secret database string');
    });
    const res = await handler(new Request('http://test/api'), EMPTY_CONTEXT);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('INTERNAL');
    expect(body.error.message).not.toContain('secret');
    expect(body.error.message).toMatch(/request [0-9a-f-]{36}/);
  });
});

describe('withPublic / toErrorResponse', () => {
  it('runs without a session and still maps errors', async () => {
    const handler = withPublic(async () => {
      throw new ApiError('RATE_LIMITED', 'slow');
    });
    const res = await handler(new Request('http://test/api/public'), EMPTY_CONTEXT);
    expect(res.status).toBe(429);
  });

  it('toErrorResponse maps a plain error to INTERNAL', async () => {
    const res = toErrorResponse('boom', 'rid-1');
    expect(res.status).toBe(500);
    expect((await res.json()).error.message).toContain('rid-1');
  });
});
