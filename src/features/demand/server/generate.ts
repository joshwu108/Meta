import 'server-only';
import { generateStructured } from '@/lib/ai';
import { serverEnv } from '@/lib/env';
import { ProposalDocument } from '../schemas';
import type { GenerateInput } from './deps';
import type { ReviseInput } from './revise';

const SLOT_TIME: Readonly<Record<string, string>> = { sat_day: '11:00', sun_day: '11:00' };

/**
 * MOCK_AI fallback for briefs the Scene 3 fixture does not fit (e.g. the board-game cluster):
 * a deterministic draft built only from the brief and venue capabilities.
 */
export function templateProposal(input: GenerateInput): ProposalDocument {
  const { brief, business, capabilities } = input;
  const interests = brief.topInterests.map((t) => t.tag);
  const theme = interests[0] ? interests[0].replace(/-/g, ' ') : brief.category.replace('_', ' ');
  const capacity = Math.max(4, Math.min(capabilities.capacity, 12));
  const range = capabilities.priceRangeCents;
  const price = range ? range.min : brief.budgetP50Cents;
  return ProposalDocument.parse({
    title: `${theme.charAt(0).toUpperCase()}${theme.slice(1)} Meetup at ${business.name}`.slice(0, 80),
    description: `A relaxed, beginner-friendly ${theme} evening for people nearby who share this interest. Small tables, easy introductions, and a host to get conversations started.`,
    category: brief.category,
    format: 'Short welcome and introductions, then hosted small-group play or activity',
    intendedSocialExperience: 'Small rotating groups so everyone meets a few new people',
    suggestedSlot: brief.slot,
    suggestedStartTimeLocal: SLOT_TIME[brief.slot] ?? '19:00',
    estimatedDurationMinutes: 120,
    suggestedCapacity: capacity,
    suggestedPriceCents: price,
    priceRangeCents: range,
    demand: { band: brief.demandBand, neighborhoodLabel: brief.neighborhoodLabel, topInterests: interests.slice(0, 5) },
    whySuggested: `People nearby are interested in ${interests.join(' and ') || theme} at this time. Interest is an estimate.`,
    assumptionsToValidate: [`${business.name} can host about ${capacity} people at this time`],
    disclaimers: ['demand_is_estimate'],
  });
}

/** Calls the `demand.generate_proposal` prompt; under MOCK_AI uses the fixture only when it fits the brief. */
export async function generateProposal(input: GenerateInput): Promise<ProposalDocument> {
  // generateStructured infers the schema's input type; parse again to apply the disclaimers default.
  const raw = await generateStructured({ prompt: 'demand.generate_proposal', input, schema: ProposalDocument, model: 'smart' });
  const doc = ProposalDocument.parse(raw);
  if (!serverEnv.isMockAi) return doc;
  const fits = doc.category === input.brief.category && doc.suggestedSlot === input.brief.slot;
  return fits ? doc : templateProposal(input);
}

/** Calls `demand.revise_proposal`; under MOCK_AI the fixture is used only when it fits, else the previous draft. */
export async function generateRevision(input: ReviseInput): Promise<ProposalDocument> {
  const raw = await generateStructured({ prompt: 'demand.revise_proposal', input, schema: ProposalDocument, model: 'smart' });
  const doc = ProposalDocument.parse(raw);
  if (!serverEnv.isMockAi) return doc;
  const slot = input.changes.slot ?? input.previous.suggestedSlot;
  const fits = doc.category === input.previous.category && doc.suggestedSlot === slot;
  return fits ? doc : input.previous;
}
