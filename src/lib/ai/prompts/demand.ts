/**
 * Workstream 04 prompt (specs/04-demand-and-proposal-engine/specs.md §5.7). Registered in `./index.ts`.
 * The input carries only an anonymous DemandBrief and the venue's public card and capabilities.
 */
import type { PromptDefinition } from './index';

const GENERATE_PROPOSAL = `You draft one concrete event proposal for a local business, based on anonymous, aggregated community interest.

Rules:
- Speak only in terms of estimated interest. Never say anyone is confirmed, guaranteed, booked, or will attend.
- Do not assert the venue is available or that any price is agreed. List what the business must check in assumptionsToValidate.
- suggestedCapacity must not exceed the business capacity. suggestedSlot must equal brief.slot and category must equal brief.category.
- If the business gives a price range, suggestedPriceCents must be inside it; otherwise stay at or below 1.5x brief.budgetP50Cents.
- Keep the title plain and specific (for example "Beginner Pottery & Coffee Night").
- Design the format so strangers can easily talk to each other; prefer the brief's groupSizeMode.
- demand.band and demand.neighborhoodLabel copy the brief. topInterests are tags from the brief.
- If feedback is present, it lists checks your previous draft failed; fix exactly those.
- If revision is present, the business owner asked to change revision.current: apply revision.request
  (priceCents, capacity, slot, note) and rewrite the description and format to match the new numbers.
  Keep everything the owner did not ask to change. The same rules above still apply.`;

export const DEMAND_PROMPTS = {
  'demand.generate_proposal': { system: GENERATE_PROPOSAL, model: 'smart' },
} as const satisfies Record<string, PromptDefinition>;
