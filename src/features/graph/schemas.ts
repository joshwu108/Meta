import { z } from 'zod';

/** Query of `GET /api/graph`. */
export const graphQuerySchema = z.object({
  /** `0` leaves out the agent's suggestion ring, for a view of existing ties only. */
  suggestions: z
    .enum(['0', '1'])
    .default('1')
    .transform((value) => value === '1'),
});
export type GraphQuery = z.infer<typeof graphQuerySchema>;
