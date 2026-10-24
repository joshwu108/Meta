import { loadFixture, type SeedContext } from '../context';
import { SEED_DOMAIN, SEED_PASSWORD, seedBusinessSchema, seedUserSchema } from '../types';

const PAGE = 200;

/** Delete every auth user under the seed domain. Cascades to profiles and everything that references them. */
export async function deleteSeedUsers(ctx: SeedContext): Promise<number> {
  let removed = 0;
  for (let page = 1; page < 50; page += 1) {
    const { data, error } = await ctx.admin.auth.admin.listUsers({ page, perPage: PAGE });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const targets = data.users.filter((user) => user.email?.endsWith(`@${SEED_DOMAIN}`));
    for (const user of targets) {
      const { error: deleteError } = await ctx.admin.auth.admin.deleteUser(user.id);
      if (deleteError) throw new Error(`deleteUser(${user.id}) failed: ${deleteError.message}`);
      removed += 1;
    }
    if (data.users.length < PAGE) break;
  }
  return removed;
}

type NewUser = { email: string; display_name: string };

async function createAuthUser(ctx: SeedContext, user: NewUser): Promise<string> {
  const { data, error } = await ctx.admin.auth.admin.createUser({
    email: user.email,
    password: SEED_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: user.display_name, is_adult_confirmed: true },
  });
  if (error || !data.user) throw new Error(`createUser(${user.email}) failed: ${error?.message}`);
  ctx.usersByEmail.set(user.email, data.user.id);
  return data.user.id;
}

/** Consumers from users.json plus one owner account per business. Profiles come from the signup trigger. */
export async function loadUsers(ctx: SeedContext): Promise<{ consumers: number; owners: number }> {
  const users = await loadFixture('users', seedUserSchema);
  const businesses = await loadFixture('businesses', seedBusinessSchema);

  for (const user of users) {
    const id = await createAuthUser(ctx, user);
    const { error } = await ctx.admin
      .from('profiles')
      .update({
        neighborhood: user.neighborhood,
        coarse_lat: user.coarse_lat,
        coarse_lng: user.coarse_lng,
        is_discoverable: user.is_discoverable,
        bio: user.bio ?? null,
        is_adult_confirmed: true,
        onboarding_completed_at: user.onboarding_completed ? new Date().toISOString() : null,
      })
      .eq('id', id);
    if (error) throw new Error(`profile update for ${user.email} failed: ${error.message}`);
  }

  for (const business of businesses) {
    const id = await createAuthUser(ctx, business.owner);
    const { error } = await ctx.admin
      .from('profiles')
      .update({ neighborhood: business.neighborhood, is_adult_confirmed: true, onboarding_completed_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(`owner profile update for ${business.owner.email} failed: ${error.message}`);
  }

  return { consumers: users.length, owners: businesses.length };
}
