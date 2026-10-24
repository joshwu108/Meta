import { loadFixture, requireUser, skipIfForeignSchema, type SeedContext } from '../context';
import { seedBusinessSchema, seedEventSchema } from '../types';

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
      })
      .select('id')
      .single();
    if (error) {
      if (skipIfForeignSchema(ctx, 'businesses', error)) return inserted;
      throw new Error(`businesses insert (${business.slug}) failed: ${error.message}`);
    }
    const businessId = (data as { id: string }).id;
    ctx.businessesBySlug.set(business.slug, businessId);
    await loadCapabilities(ctx, businessId, business.capacity, business.category);
    inserted += 1;
  }
  return inserted;
}

/** Capacity and hostable categories live in business_capabilities (workstream 05). */
async function loadCapabilities(ctx: SeedContext, businessId: string, capacity: number, category: string): Promise<void> {
  const { error } = await ctx.admin
    .from('business_capabilities')
    .insert({ business_id: businessId, capacity, event_categories: [category] });
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

/** Groups are seeded by workstream 03's loader: it also writes `kind`, `interests` and pending invitations. */
export { loadGroups } from './social';
