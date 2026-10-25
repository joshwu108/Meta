import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { adminClient, createTestUser, type TestUser } from '../helpers';
import { cleanupSocialUsers, setProfile, setTestOrigin } from '../social/support';

/**
 * Principle 2 of specs/07-profile-import/specs.md, and the reason the feature is allowed to read
 * anything at all: a suggestion is not a fact. Until the member accepts it, an imported trait
 * lives only in 07's tables — never in `user_preferences`, never in another member's matching,
 * never in a prompt written for somebody else's agent.
 *
 * 07's own suites check its pipeline with mocks. This one checks the boundary it shares with 02,
 * which is the kind of contract that drifts silently when each side is only tested alone.
 */

vi.mock('server-only', () => ({}));

const admin = adminClient();
setTestOrigin('import-boundary');

/** `trait_suggestions.value` holds the normalized tag, which is the form that lands in the profile. */
const PENDING_TRAIT = 'rock-climbing';
let member: TestUser;
let suggestionId: string;

const agent = await import('@/features/agent');

async function sharedInterests(): Promise<string[]> {
  const shared = await agent.getSharablePreferences(member.id, 'matching');
  return shared?.interests ?? [];
}

beforeAll(async () => {
  member = await createTestUser(admin, 'import-member');
  await setProfile(admin, member, { interests: ['pottery'] }, { matching: true, demand: true });

  const { data, error } = await admin
    .from('trait_suggestions')
    .insert({
      user_id: member.id,
      field: 'interests',
      value: PENDING_TRAIT,
      label: 'Rock climbing',
      category: 'fitness',
      confidence: 0.8,
      band: 'strong',
      evidence: [],
    })
    .select('id')
    .single();
  if (error) throw new Error(`trait_suggestions insert failed: ${error.message}`);
  suggestionId = data.id as string;
}, 60_000);

afterAll(async () => {
  await admin.from('trait_suggestions').delete().eq('user_id', member.id);
  await cleanupSocialUsers(admin);
});

describe('a pending suggestion', () => {
  it('is waiting for the member, not applied to them', async () => {
    const { data } = await admin
      .from('trait_suggestions')
      .select('status')
      .eq('id', suggestionId)
      .single();
    expect(data?.status).toBe('pending');
  });

  it('never reaches another member’s agent through the consent boundary', async () => {
    const interests = await sharedInterests();
    expect(interests).toContain('pottery');
    expect(interests, 'a suggestion is not a fact').not.toContain(PENDING_TRAIT);
  });

  it('is absent from the preferences the member actually holds', async () => {
    const { data } = await admin
      .from('user_preferences')
      .select('interests')
      .eq('user_id', member.id)
      .single();
    expect((data?.interests as string[]) ?? []).not.toContain(PENDING_TRAIT);
  });

  it('becomes a fact once the member accepts it, and only then', async () => {
    const { decideSuggestions } = await import('@/features/import/server/decide');
    // 'yes' is how the review screen adds a trait; 'love' is the same thing, more strongly.
    await decideSuggestions(member.id, {
      decisions: [{ id: suggestionId, action: 'yes' }],
    } as never);

    const { data } = await admin
      .from('user_preferences')
      .select('interests')
      .eq('user_id', member.id)
      .single();
    expect((data?.interests as string[]) ?? []).toContain(PENDING_TRAIT);
    expect(await sharedInterests()).toContain(PENDING_TRAIT);
  });
});
