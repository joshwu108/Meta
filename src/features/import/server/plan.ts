import 'server-only';
import { getOwnPreferencesForImport } from '@/features/agent';
import { logAgentAction } from '@/features/core';
import { getNearbyBusinesses, getRecommendedEvents, getUpcomingEventsForUser } from '@/features/events';
import { listMyGroups } from '@/features/groups';
import { getConnectionIds, getSuggestedPeople, type Actor } from '@/features/matching';
import { generateStructured } from '@/lib/ai';
import { ApiError } from '@/lib/api';
import { log } from '@/lib/log';
import { createAdminClient } from '@/lib/supabase/admin';
import { PlanOutputSchema, type PlanView } from '../schemas';
import { fallbackPlan, planPromptInput, rankCandidates, validatePlan, type Candidates, type PlanCard, type PlanStep } from './plan-core';
import { listLovedAndDislikes } from './repo';

const NEARBY_KM = 5;
const MANUAL_DONE: ReadonlySet<PlanStep['action']> = new Set(['open_place', 'create_group', 'invite_group']);


const doneKey = (step: PlanStep) => `${step.action}:${step.targetId ?? step.ref}`;

async function gather(actor: Actor): Promise<Candidates> {
  const settle = async <T>(what: string, p: Promise<T>, empty: T): Promise<T> => {
    try {
      return await p;
    } catch (error) {
      log.warn('import.plan.candidates_failed', { what, code: error instanceof ApiError ? error.code : 'UNKNOWN' });
      return empty;
    }
  };
  const [people, events, places, groups] = await Promise.all([
    settle('people', getSuggestedPeople(actor.userId, 5), []),
    settle('events', getRecommendedEvents(actor.userId, 8), []),
    settle('places', getNearbyBusinesses(actor.userId, NEARBY_KM), []),
    settle('groups', listMyGroups(actor), []),
  ]);
  return {
    people: people.map((p) => ({ id: p.userId, sharedInterests: p.sharedInterests, neighborhood: p.neighborhood })),
    events: events.map((r) => ({
      id: r.event.id, title: r.event.title, category: r.event.category, slot: r.slot,
      neighborhood: r.event.business.neighborhood, priceCents: r.event.priceCents,
    })),
    places: places.map((b) => ({ id: b.id, name: b.name, category: b.category, neighborhood: b.neighborhood, distanceKm: b.distanceKm })),
    groups: groups.filter((g) => g.myStatus === 'active').map((g) => ({ id: g.id, name: g.name, interests: g.interests, memberCount: g.memberCount })),
  };
}

/** Build and store a fresh plan. The model sees refs only; code resolves refs to links. */
export async function buildPlan(actor: Actor): Promise<void> {
  const [prefs, taste] = await Promise.all([getOwnPreferencesForImport(actor.userId), listLovedAndDislikes(actor.userId)]);
  const ranked = rankCandidates(await gather(actor), { interests: prefs.interests, loved: taste.loved, dislikes: taste.dislikes });
  const trimmed: Candidates = { people: ranked.people.slice(0, 5), events: ranked.events.slice(0, 8), places: ranked.places.slice(0, 5), groups: ranked.groups.slice(0, 3) };
  let cards: PlanCard[] = [];
  let aiUsed = false;
  try {
    const output = await generateStructured({
      prompt: 'import.plan',
      input: planPromptInput(trimmed, { interests: prefs.interests, loved: taste.loved, dislikes: taste.dislikes }),
      schema: PlanOutputSchema,
    });
    cards = validatePlan(output, trimmed);
    aiUsed = cards.length > 0;
  } catch (error) {
    log.warn('import.plan.ai_unavailable', { code: error instanceof ApiError ? error.code : 'UNKNOWN' });
  }
  if (cards.length === 0) cards = fallbackPlan(trimmed);
  const { error } = await createAdminClient()
    .from('import_plans')
    .upsert({ user_id: actor.userId, cards, done: [], ai_used: aiUsed });
  if (error) throw new ApiError('INTERNAL', 'Failed to save your plan', 500, { code: error.code });
  await logAgentAction({
    userId: actor.userId,
    action: 'import_build_plan',
    permissionsUsed: [],
    result: `Suggested a plan with ${cards.length} ${cards.length === 1 ? 'idea' : 'ideas'}; nothing was booked or sent`,
  });
}

/** The stored plan with each step's done state from real data (connections, RSVPs) or a manual tap. */
export async function readPlan(userId: string): Promise<PlanView | null> {
  const { data, error } = await createAdminClient().from('import_plans').select('cards, done, ai_used, updated_at').eq('user_id', userId).maybeSingle();
  if (error) throw new ApiError('INTERNAL', 'Failed to load your plan', 500, { code: error.code });
  if (!data) return null;
  const cards = (Array.isArray(data.cards) ? data.cards : []) as PlanCard[];
  const manual = new Set((Array.isArray(data.done) ? data.done : []) as string[]);
  const [connections, upcoming] = await Promise.all([getConnectionIds(userId), getUpcomingEventsForUser(userId)]);
  const rsvped = new Set(upcoming.filter((e) => e.rsvpStatus && e.rsvpStatus !== 'cancelled').map((e) => e.id));
  const isDone = (step: PlanStep) =>
    step.action === 'connect' ? connections.has(step.targetId ?? '') : step.action === 'rsvp' ? rsvped.has(step.targetId ?? '') : manual.has(doneKey(step));
  return {
    cards: cards.map((card) => ({ ...card, steps: card.steps.map((step) => ({ ...step, done: isDone(step), doneKey: doneKey(step) })) })),
    aiUsed: data.ai_used,
    updatedAt: data.updated_at,
  };
}

/** Manual "Done" for steps with no data behind them (places, groups). */
export async function markStepDone(userId: string, key: string): Promise<void> {
  const plan = await readPlan(userId);
  const step = plan?.cards.flatMap((c) => c.steps).find((s) => s.doneKey === key);
  if (!step) throw new ApiError('NOT_FOUND', 'That step is not in your plan');
  if (!MANUAL_DONE.has(step.action)) throw new ApiError('VALIDATION', 'This step completes when you do it in the app', 400, { field: 'key' });
  const admin = createAdminClient();
  const { data } = await admin.from('import_plans').select('done').eq('user_id', userId).single();
  const done = [...new Set([...((data?.done as string[] | null) ?? []), key])];
  const { error } = await admin.from('import_plans').update({ done }).eq('user_id', userId);
  if (error) throw new ApiError('INTERNAL', 'Failed to save', 500, { code: error.code });
}
