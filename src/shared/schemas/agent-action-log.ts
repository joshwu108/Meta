import { z } from 'zod';
import { isoTimestampSchema, uuidSchema } from './common';
import { agentActorSchema } from './enums';

/** Row shape of `public.agent_action_log`. */
export const agentActionLogRowSchema = z.object({
  id: uuidSchema,
  user_id: uuidSchema.nullable(),
  actor: agentActorSchema,
  action: z.string().min(1).max(80),
  permissions_used: z.array(z.string()),
  result: z.string().max(500),
  metadata: z.record(z.unknown()),
  created_at: isoTimestampSchema,
});
export type AgentActionLogRow = z.infer<typeof agentActionLogRowSchema>;

/** Input for `logAgentAction()` (README §4 contract). */
export const logAgentActionInputSchema = z.object({
  userId: uuidSchema.nullable().optional(),
  actor: agentActorSchema.default('personal_agent'),
  action: z.string().min(1).max(80),
  permissionsUsed: z.array(z.string()).default([]),
  result: z.string().max(500),
  metadata: z.record(z.unknown()).default({}),
});
export type LogAgentActionInput = z.input<typeof logAgentActionInputSchema>;
