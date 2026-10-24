import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const maybeSingle = vi.fn();
const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }));
vi.mock('@/lib/supabase/server', () => ({ createServerClient: vi.fn(async () => ({ auth: { getUser }, from })) }));

const { EMPTY_CONTEXT, withBusinessOwner } = await import('@/lib/api');

describe('withBusinessOwner', () => {
  beforeEach(() => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    maybeSingle.mockReset();
  });

  it('injects the owned business', async () => {
    maybeSingle.mockResolvedValue({ data: { id: 'b1', owner_id: 'u1', name: 'Kiln' }, error: null });
    const handler = withBusinessOwner(async (ctx) => Response.json({ business: ctx.business.id }));
    const res = await handler(new Request('http://test/api/business/me'), EMPTY_CONTEXT);
    expect(await res.json()).toEqual({ business: 'b1' });
  });

  it('returns FORBIDDEN when the user owns no business or the table is missing', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const handler = withBusinessOwner(async () => new Response('never'));
    expect((await handler(new Request('http://test/api'), EMPTY_CONTEXT)).status).toBe(403);
    maybeSingle.mockResolvedValue({ data: null, error: { code: '42P01', message: 'relation does not exist' } });
    expect((await handler(new Request('http://test/api'), EMPTY_CONTEXT)).status).toBe(403);
  });

  it('returns INTERNAL on other database errors', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { code: '08000', message: 'connection' } });
    const handler = withBusinessOwner(async () => new Response('never'));
    const res = await handler(new Request('http://test/api'), EMPTY_CONTEXT);
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe('INTERNAL');
  });
});
