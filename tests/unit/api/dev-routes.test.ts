import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { devRoutesEnabled } from '@/lib/api/dev-routes';

/**
 * The guard on `/api/dev/*`. One of those routes inserts fixture proposals and the other
 * signs a user in, so "is this a production deployment" has to be answered conservatively.
 */
describe('dev route guard', () => {
  const original = { ...process.env };

  beforeEach(() => {
    delete process.env.ENABLE_DEV_ROUTES;
    delete process.env.VERCEL_ENV;
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it('is off unless the flag is set deliberately', () => {
    expect(devRoutesEnabled()).toBe(false);
  });

  it('is on locally when the flag is set', () => {
    process.env.ENABLE_DEV_ROUTES = '1';
    expect(devRoutesEnabled()).toBe(true);
  });

  it('stays off on a production deployment even if the flag was set by mistake', () => {
    process.env.ENABLE_DEV_ROUTES = '1';
    process.env.VERCEL_ENV = 'production';
    expect(devRoutesEnabled()).toBe(false);
  });

  it('is on for a preview deployment with the flag set', () => {
    process.env.ENABLE_DEV_ROUTES = '1';
    process.env.VERCEL_ENV = 'preview';
    expect(devRoutesEnabled()).toBe(true);
  });

  it('only accepts exactly "1", not any truthy string', () => {
    for (const value of ['true', 'yes', '0', '', 'TRUE']) {
      process.env.ENABLE_DEV_ROUTES = value;
      expect(devRoutesEnabled(), `"${value}" should not enable dev routes`).toBe(false);
    }
  });

  it('does not key off NODE_ENV, which is production for a local build too', () => {
    process.env.ENABLE_DEV_ROUTES = '1';
    // NODE_ENV is typed readonly, so set it through the record itself.
    Object.assign(process.env, { NODE_ENV: 'production' });
    expect(devRoutesEnabled()).toBe(true);
  });
});
