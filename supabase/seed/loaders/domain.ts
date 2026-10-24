import { loadFixture, requireUser, skipIfForeignSchema, type SeedContext } from '../context';
import { seedBusinessSchema, seedEventSchema, seedGroupSchema , type SeedBusiness } from '../types';

/**
 * Businesses, events and groups live in tables owned by workstreams 05, 06 and 03. The loaders
 * below insert the baseline fixtures using the column names from those workstreams' migrations
 * (0500_business.sql, 0300_social.sql) and skip cleanly (returning 0) while a table is missing
 * or its columns differ. Owning workstreams extend them.
 */

export async function loadBusinesses(ctx: SeedContext): Promise<number> {
  const businesses = await loadFixture('businesses', seedBusinessSchema);
  let inserted = 0;
  for (const business of businesses) {
    const { data, error } = await ctx.admin
      .from('businesses')
      .insert({
        owner_id: requireUser(ctx, business.owner.email),
        name: business.name,
        slug: business.slug,
        category: business.category,
        neighborhood: business.neighborhood,
        address: business.address,
        description: business.description,
        lat: business.lat,
        lng: business.lng,
        ...(business.hours ? { hours: business.hours } : {}),
      })
      .select('id')
      .single();
    if (error) {
      if (skipIfForeignSchema(ctx, 'businesses', error)) return inserted;
      throw new Error(`businesses insert (${business.slug}) failed: ${error.message}`);
    }
    const businessId = (data as { id: string }).id;
    ctx.businessesBySlug.set(business.slug, businessId);
    await loadCapabilities(ctx, businessId, business);
    inserted += 1;
  }
  return inserted;
}

/**
 * What a venue can host lives in `business_capabilities` (workstream 05). A fixture that
 * carries no `capabilities` block still seeds a usable row from the base fields.
 */
async function loadCapabilities(ctx: SeedContext, businessId: string, business: SeedBusiness): Promise<void> {
  const c = business.capabilities;
  const { error } = await ctx.admin.from('business_capabilities').insert({
    business_id: businessId,
    capacity: business.capacity,
    event_categories: c?.event_categories ?? [business.category],
    min_price_cents: c?.min_price_cents ?? null,
    max_price_cents: c?.max_price_cents ?? null,
    hosting_slots: c?.hosting_slots ?? [],
    equipment_tags: c?.equipment_tags ?? [],
    formats: c?.formats ?? [],
    notes: c?.notes ?? null,
    accepts_ai_proposals: c?.accepts_ai_proposals ?? true,
  });
  if (error && !skipIfForeignSchema(ctx, 'business_capabilities', error)) {
    throw new Error(`business_capabilities insert failed: ${error.message}`);
  }
}

function eventTimes(daysFromNow: number, startHour: number, durationHours: number): { startsAt: string; endsAt: string } {
  const start = new Date();
  start.setDate(start.getDate() + daysFromNow);
  start.setHours(startHour, 0, 0, 0);
  const end = new Date(start.getTime() + durationHours * 3_600_000);
  return { startsAt: start.toISOString(), endsAt: end.toISOString() };
}

export async function loadEvents(ctx: SeedContext): Promise<number> {
  if (ctx.businessesBySlug.size === 0) {
    ctx.log('no businesses seeded; skipping events');
    return 0;
  }
  const events = await loadFixture('events', seedEventSchema);
  const rows = events.map((event) => {
    const businessId = ctx.businessesBySlug.get(event.business);
    if (!businessId) throw new Error(`event ${event.slug} references unknown business ${event.business}`);
    const { startsAt, endsAt } = eventTimes(event.days_from_now, event.start_hour, event.duration_hours);
    return {
      business_id: businessId,
      title: event.title,
      description: event.description,
      category: event.category,
      starts_at: startsAt,
      ends_at: endsAt,
      capacity: event.capacity,
      price_cents: event.price_cents,
      format: event.format,
      status: 'published',
      source: 'business_manual',
    };
  });
  const { error } = await ctx.admin.from('events').insert(rows);
  if (error) {
    if (skipIfForeignSchema(ctx, 'events', error)) return 0;
    throw new Error(`events insert failed: ${error.message}`);
  }
  return rows.length;
}

export async function loadGroups(ctx: SeedContext): Promise<number> {
  const groups = await loadFixture('groups', seedGroupSchema);
  let inserted = 0;
  for (const group of groups) {
    const ownerId = requireUser(ctx, group.owner);
    const { data, error } = await ctx.admin
      .from('groups')
      .insert({ name: group.name, description: group.description, visibility: group.visibility, creator_id: ownerId })
      .select('id')
      .single();
    if (error) {
      if (skipIfForeignSchema(ctx, 'groups', error)) return inserted;
      throw new Error(`groups insert (${group.slug}) failed: ${error.message}`);
    }
    const groupId = (data as { id: string }).id;
    const joinedAt = new Date().toISOString();
    const members = [
      { group_id: groupId, user_id: ownerId, role: 'owner', status: 'active', joined_at: joinedAt },
      ...group.members.map((email) => ({ group_id: groupId, user_id: requireUser(ctx, email), role: 'member', status: 'active', joined_at: joinedAt })),
    ];
    const { error: memberError } = await ctx.admin.from('group_members').insert(members);
    if (memberError && !skipIfForeignSchema(ctx, 'group_members', memberError)) {
      throw new Error(`group_members insert (${group.slug}) failed: ${memberError.message}`);
    }
    inserted += 1;
  }
  return inserted;
}
