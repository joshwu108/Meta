import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Workstream 05's slice of the seed (spec section 8). Workstream 01 owns the runner;
 * it only has to call `seedBusinesses(admin)` after the auth users exist.
 *
 * Idempotent: a business is matched on its slug, so re-running updates rather than
 * duplicating. One pending proposal for Ritual Grounds makes the inbox non-empty before
 * Scene 3 has run.
 */

type Capabilities = {
  eventCategories: string[];
  capacity: number;
  minPriceCents: number | null;
  maxPriceCents: number | null;
  hostingSlots: string[];
  equipmentTags: string[];
  formats: string[];
  notes: string | null;
  acceptsAiProposals: boolean;
};

type BusinessFixture = {
  slug: string;
  ownerEmail: string;
  name: string;
  description: string;
  category: string;
  address: string;
  neighborhood: string;
  lat: number;
  lng: number;
  imageUrl: string | null;
  hours: Record<string, [string, string][]>;
  capabilities: Capabilities;
};

type ProposalFixture = {
  businessSlug: string;
  status: string;
  source: string;
  proposal: Record<string, unknown>;
};

const fixturesDir = path.join(process.cwd(), 'supabase', 'seed', 'fixtures');

const readFixture = async <T>(name: string): Promise<T> =>
  JSON.parse(await readFile(path.join(fixturesDir, name), 'utf8')) as T;

async function ownerIdFor(admin: SupabaseClient, email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (error) throw new Error(`could not list auth users: ${error.message}`);

  const existing = data.users.find((user) => user.email === email);
  if (existing) return existing.id;

  const created = await admin.auth.admin.createUser({
    email,
    password: 'commonground-demo',
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    throw new Error(`could not create ${email}: ${created.error?.message ?? 'unknown error'}`);
  }
  return created.data.user.id;
}

export type SeedSummary = { businesses: number; proposals: number };

export async function seedBusinesses(admin: SupabaseClient): Promise<SeedSummary> {
  const businesses = await readFixture<BusinessFixture[]>('businesses.json');
  const bySlug = new Map<string, string>();

  for (const fixture of businesses) {
    const ownerId = await ownerIdFor(admin, fixture.ownerEmail);

    const { data, error } = await admin
      .from('businesses')
      .upsert(
        {
          owner_id: ownerId,
          name: fixture.name,
          slug: fixture.slug,
          description: fixture.description,
          category: fixture.category,
          address: fixture.address,
          neighborhood: fixture.neighborhood,
          lat: fixture.lat,
          lng: fixture.lng,
          image_url: fixture.imageUrl,
          hours: fixture.hours,
          is_active: true,
        },
        { onConflict: 'slug' },
      )
      .select('id')
      .single();

    if (error) throw new Error(`could not seed ${fixture.slug}: ${error.message}`);
    const businessId = (data as { id: string }).id;
    bySlug.set(fixture.slug, businessId);

    const capabilities = fixture.capabilities;
    const { error: capError } = await admin.from('business_capabilities').upsert(
      {
        business_id: businessId,
        event_categories: capabilities.eventCategories,
        capacity: capabilities.capacity,
        min_price_cents: capabilities.minPriceCents,
        max_price_cents: capabilities.maxPriceCents,
        hosting_slots: capabilities.hostingSlots,
        equipment_tags: capabilities.equipmentTags,
        formats: capabilities.formats,
        notes: capabilities.notes,
        accepts_ai_proposals: capabilities.acceptsAiProposals,
      },
      { onConflict: 'business_id' },
    );
    if (capError) throw new Error(`could not seed capabilities for ${fixture.slug}: ${capError.message}`);
  }

  let proposals = 0;
  for (const fixture of await readFixture<ProposalFixture[]>('proposals.json')) {
    const businessId = bySlug.get(fixture.businessSlug);
    if (!businessId) continue;

    const title = (fixture.proposal as { title?: string }).title ?? '';
    const { data: existing } = await admin
      .from('event_proposals')
      .select('id, proposal')
      .eq('business_id', businessId)
      .eq('status', fixture.status);

    const already = (existing ?? []).some(
      (row) => ((row as { proposal: { title?: string } }).proposal?.title ?? '') === title,
    );
    if (already) continue;

    const { error } = await admin.from('event_proposals').insert({
      business_id: businessId,
      cluster_id: null,
      source: fixture.source,
      status: fixture.status,
      proposal: fixture.proposal,
    });

    // 04's table may not be migrated yet; a missing table is not a seed failure.
    if (error) {
      console.warn(`[seed] skipped the pre-seeded proposal: ${error.message}`);
      continue;
    }
    proposals += 1;
  }

  return { businesses: businesses.length, proposals };
}
