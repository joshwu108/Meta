import "server-only";

// Workstream 02's exports (specs/02-onboarding-and-agent/specs.md §5), re-exported under the
// names 06's modules already import — the same move `./social.ts` and `./core.ts` made when 03
// and 01 landed. These were stand-ins written while 02 was unmerged; 02 is on main, so asking it
// directly is what keeps consent, explanations and follow-ups honest. 06's own suites run against
// a pglite stand-in schema and so never saw the difference; `tests/integration/events/
// agent-contract.test.ts` is what holds these to the real boundary.

export {
  explainRecommendation,
  explainDetailed,
  getAttendeeSharing,
  getConsent,
  getSharablePreferences,
  suggestFollowUp,
  type AttendeeSharing,
  type Consent,
  type ExplainInput,
  type ExplainTarget,
} from "@/features/agent";
