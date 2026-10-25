import { AgentRail } from "@/features/agent/components/agent-home";

/** `/agent` right rail (≥1024px): the agent's Preferences / Permissions / Activity tabs (spec 02 §7). */
export default function AgentAsideRail() {
  return (
    <div className="mx-2">
      <AgentRail />
    </div>
  );
}
