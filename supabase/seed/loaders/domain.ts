import { isMissingTable, loadFixture, requireUser, type SeedContext } from '../context';
import { seedBusinessSchema, seedEventSchema } from '../types';

/**
 * Businesses, events and groups live in tables owned by workstreams 05, 06 and 03. The loaders
 * below insert the baseline fixtures using the column names from those specs and skip cleanly
 * (returning 0) while a table has not been migrated yet. Owning workstreams extend them.
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
        capacity: business.capacity,
      })
      .select('id')
      .single();
    if (error) {
      if (isMissingTable(error)) {
        ctx.log('businesses table not migrated yet (workstream 05); skipping businesses');
        return 0;
      }
      throw new Error(`businesses insert (${business.slug}) failed: ${error.message}`);
    }
    ctx.businessesBySlug.set(business.slug, (data as { id: string }).id);
    inserted += 1;
  }
  return inserted;
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
    if (isMissingTable(error)) {
      ctx.log('events table not migrated yet (workstream 05/06); skipping events');
      return 0;
    }
    throw new Error(`events insert failed: ${error.message}`);
  }
  return rows.length;
}

/** Groups are seeded by workstream 03's loader (column names from specs/03 §4). */
export { loadGroups } from './social';
