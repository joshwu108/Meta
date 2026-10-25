import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { fail, ok, parseBody,  withBusinessOwner } from '@/lib/api';
import { devRoutesEnabled } from '@/lib/api/dev-routes';
import { createAdminClient } from '@/lib/supabase/admin';
import { ApiError } from '@/lib/api';
import { businessDeps } from '@/features/business/server/context';
import { toProposalDetail } from '@/features/business/server/proposals';

/**
 * Spec section 11: until workstream 04 lands its pipeline, this dev-only route inserts one
 * fixture proposal for the caller's business so the inbox is not empty. Never available in
 * production.
 */

const FIXTURES = ['pottery-night', 'coffee-tasting'] as const;

const bodySchema = z.object({
  fixture: z.enum(FIXTURES).default('pottery-night'),
  clusterId: z.string().uuid().nullish(),
});

export const POST = withBusinessOwner(async (ctx, req) => {
    if (!devRoutesEnabled()) {
      return fail('NOT_FOUND', 'not found');
    }

    const { fixture, clusterId } = await parseBody(bodySchema, req);
    const file = path.join(process.cwd(), 'tests', 'fixtures', 'proposals', `${fixture}.json`);
    const proposal = JSON.parse(await readFile(file, 'utf8')) as unknown;

    // Inserted with the service role, because this stands in for workstream 04's pipeline,
    // which runs as a worker. 04's RLS deliberately gives a business owner SELECT only: a
    // venue must never be able to fabricate demand for itself.
    //
    // `event_proposals` is 04's table, so it is not in the generated Database types and the
    // typed client refuses the name.
    const untyped = createAdminClient() as unknown as {
      from: (table: string) => {
        insert: (row: Record<string, unknown>) => {
          select: (cols: string) => {
            single: () => Promise<{ data: { id: string } | null; error: { code?: string; message?: string } | null }>;
          };
        };
      };
    };

    const { data, error } = await untyped
      .from('event_proposals')
      .insert({
        business_id: ctx.business.id,
        cluster_id: clusterId ?? null,
        source: 'demand',
        status: 'pending',
        proposal,
      })
      .select('id')
      .single();

    if (error) {
      // Only a missing relation means "04 has not merged yet"; anything else is a real
      // failure and must not be mistaken for it by the e2e suite's skip check.
      const missingTable = error.code === '42P01' || error.code === 'PGRST205';
      throw new ApiError(
        'CONFLICT',
        missingTable
          ? "workstream 04's event_proposals table is not migrated yet"
          : `could not insert a fixture proposal: ${error.code ?? 'unknown'} ${error.message ?? ''}`.trim(),
      );
    }

    const deps = businessDeps(ctx.supabase);
    const row = await deps.store.findProposal((data as { id: string }).id);
    if (!row) throw new ApiError('INTERNAL', 'the fixture proposal disappeared');
    return ok(toProposalDetail(row, deps), undefined, { status: 201 });
});
