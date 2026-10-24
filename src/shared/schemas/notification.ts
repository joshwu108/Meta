import { z } from 'zod';
import { isoTimestampSchema, nullableTimestampSchema, uuidSchema } from './common';
import { notificationTypeSchema } from './enums';

/** Row shape of `public.notifications`. */
export const notificationRowSchema = z.object({
  id: uuidSchema,
  user_id: uuidSchema,
  type: notificationTypeSchema,
  payload: z.record(z.unknown()),
  read_at: nullableTimestampSchema,
  created_at: isoTimestampSchema,
});
export type NotificationRow = z.infer<typeof notificationRowSchema>;

/** Input for `notify()`. */
export const notifyInputSchema = z.object({
  userId: uuidSchema,
  type: notificationTypeSchema,
  payload: z.record(z.unknown()).default({}),
});
export type NotifyInput = z.infer<typeof notifyInputSchema>;

/** Query for `GET /api/notifications`. */
export const notificationListQuerySchema = z.object({
  unread: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
