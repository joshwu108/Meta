import { describe, expect, it } from 'vitest';
import { capacityRatio } from '@/features/core/components/ui/CapacityMeter';
import { statusLabel, statusTone } from '@/features/core/components/ui/StatusPill';
import { cn } from '@/features/core/components/ui/cn';
import { removeLabel } from '@/features/core/components/ui/Chip';
import { isNavActive } from '@/features/core/components/app-shell/nav';
import { notificationBody, notificationHref, notificationTitle, relativeTime } from '@/features/core/components/notifications/NotificationList';

describe('ui helpers', () => {
  it('cn joins truthy classes', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b');
  });
  it('removeLabel gives each chip a distinct accessible name', () => {
    expect(removeLabel('Pottery', 'Pottery')).toBe('Remove Pottery');
    expect(removeLabel(undefined, 'Coffee')).toBe('Remove Coffee');
    expect(removeLabel(undefined, 3)).toBe('Remove 3');
    expect(removeLabel(undefined, null)).toBe('Remove');
  });
  it('capacityRatio clamps to [0,1] and treats zero capacity as full', () => {
    expect(capacityRatio(5, 10)).toBe(0.5);
    expect(capacityRatio(15, 10)).toBe(1);
    expect(capacityRatio(-1, 10)).toBe(0);
    expect(capacityRatio(0, 0)).toBe(1);
  });
  it('statusTone maps semantic colors and falls back to neutral', () => {
    expect(statusTone('published')).toBe('success');
    expect(statusTone('pending')).toBe('warning');
    expect(statusTone('cancelled')).toBe('danger');
    expect(statusTone('full')).toBe('brand');
    expect(statusTone('whatever')).toBe('neutral');
    expect(statusLabel('approved_draft')).toBe('Draft');
    expect(statusLabel('awaiting_approval')).toBe('Awaiting approval');
  });
  it('isNavActive matches nested paths except for the business root', () => {
    expect(isNavActive('/events/123', '/events')).toBe(true);
    expect(isNavActive('/eventsx', '/events')).toBe(false);
    expect(isNavActive('/business/events', '/business')).toBe(false);
    expect(isNavActive('/business', '/business')).toBe(true);
  });
  it('notification title/body prefer payload values and relativeTime buckets', () => {
    const base = { id: 'n', user_id: 'u', read_at: null, created_at: new Date().toISOString() } as const;
    expect(notificationTitle({ ...base, type: 'rsvp_confirmed', payload: {} })).toBe('RSVP confirmed');
    expect(notificationTitle({ ...base, type: 'rsvp_confirmed', payload: { title: 'Custom' } })).toBe('Custom');
    expect(notificationBody({ ...base, type: 'rsvp_confirmed', payload: { body: 'b' } })).toBe('b');
    expect(notificationBody({ ...base, type: 'rsvp_confirmed', payload: {} })).toBeNull();
    expect(notificationHref({ ...base, type: 'group_invite', payload: { href: '/groups/abc' } })).toBe('/groups/abc');
    expect(notificationHref({ ...base, type: 'group_invite', payload: { href: '/match?tab=requests' } })).toBe('/match?tab=requests');
    expect(notificationHref({ ...base, type: 'group_invite', payload: {} })).toBeNull();
    expect(notificationHref({ ...base, type: 'group_invite', payload: { href: 'https://evil.com' } })).toBeNull();
    expect(notificationHref({ ...base, type: 'group_invite', payload: { href: '//evil.com' } })).toBeNull();
    const now = Date.now();
    expect(relativeTime(new Date(now).toISOString(), now)).toBe('just now');
    expect(relativeTime(new Date(now - 5 * 60_000).toISOString(), now)).toBe('5m');
    expect(relativeTime(new Date(now - 3 * 3_600_000).toISOString(), now)).toBe('3h');
    expect(relativeTime(new Date(now - 49 * 3_600_000).toISOString(), now)).toBe('2d');
  });
});
