import { describe, expect, it } from 'vitest';
import { buildAttendeeList, buildBusinessPublicCard, type RsvpRow } from '@/features/business/server/dto';

const row = (over: Partial<RsvpRow> = {}): RsvpRow => ({
  status: 'confirmed',
  share_with_business: false,
  display_name: 'Ada Lovelace',
  ...over,
});

/** Spec section 9, T-U4 and section 10 criterion 3. */
describe('attendee name masking', () => {
  it('shows a name only when the attendee consented', () => {
    const list = buildAttendeeList([
      row({ share_with_business: true, display_name: 'Ada Lovelace' }),
      row({ share_with_business: false, display_name: 'Grace Hopper' }),
    ]);
    expect(list.attendees).toEqual([{ displayName: 'Ada Lovelace' }, { displayName: null }]);
  });

  it('never includes a name that was not consented, anywhere in the payload', () => {
    const list = buildAttendeeList([row({ share_with_business: false, display_name: 'Grace Hopper' })]);
    expect(JSON.stringify(list)).not.toContain('Grace Hopper');
  });

  it('masks a consenting attendee who has no display name', () => {
    const list = buildAttendeeList([row({ share_with_business: true, display_name: null })]);
    expect(list.attendees).toEqual([{ displayName: null }]);
  });

  it('includes shared interests only alongside a consented name', () => {
    const list = buildAttendeeList([
      row({ share_with_business: true, shared_interests: ['pottery'] }),
      row({ share_with_business: false, shared_interests: ['pottery'] }),
    ]);
    expect(list.attendees[0]).toEqual({ displayName: 'Ada Lovelace', sharedInterests: ['pottery'] });
    expect(list.attendees[1]).toEqual({ displayName: null });
  });

  it('omits the shared interests key when the list is empty', () => {
    const list = buildAttendeeList([row({ share_with_business: true, shared_interests: [] })]);
    expect(list.attendees[0]).toEqual({ displayName: 'Ada Lovelace' });
  });

  it('counts confirmed and waitlisted separately and ignores cancelled rows', () => {
    const list = buildAttendeeList([
      row({ status: 'confirmed' }),
      row({ status: 'confirmed' }),
      row({ status: 'waitlisted' }),
      row({ status: 'cancelled' }),
    ]);
    expect(list.confirmedCount).toBe(2);
    expect(list.waitlistedCount).toBe(1);
    expect(list.attendees).toHaveLength(2);
  });

  it('returns empty counts for an event with no rsvps', () => {
    expect(buildAttendeeList([])).toEqual({ confirmedCount: 0, waitlistedCount: 0, attendees: [] });
  });
});

describe('business public card', () => {
  it('carries no owner id and no capability notes', () => {
    const card = buildBusinessPublicCard({
      id: 'b1',
      name: 'Kiln & Cup',
      category: 'creative',
      neighborhood: 'Mission',
      address: '1 Valencia St',
      description: 'Pottery studio and coffee bar',
      image_url: null,
    });
    expect(Object.keys(card).sort()).toEqual([
      'address',
      'category',
      'description',
      'id',
      'imageUrl',
      'name',
      'neighborhood',
    ]);
  });

  it('normalizes a missing neighborhood and description to empty strings', () => {
    const card = buildBusinessPublicCard({
      id: 'b1',
      name: 'Kiln & Cup',
      category: 'creative',
      neighborhood: null,
      address: '1 Valencia St',
      description: null,
      image_url: null,
    });
    expect(card.neighborhood).toBe('');
    expect(card.description).toBe('');
  });
});
