import { z } from 'zod';

/** Reusable field schemas. */
export const uuidSchema = z.string().uuid();
export const isoTimestampSchema = z.string().datetime({ offset: true });
export const nullableTimestampSchema = isoTimestampSchema.nullable();
/** Coarse coordinate rounded to 2 decimal places (~1 km), matching `numeric(6,2)`. */
export const coarseCoordinateSchema = z
  .number()
  .min(-180)
  .max(180)
  .transform((value) => Math.round(value * 100) / 100);
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
