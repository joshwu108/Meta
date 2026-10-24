import { z } from 'zod';
import { coarseCoordinateSchema, nullableTimestampSchema, uuidSchema, isoTimestampSchema } from './common';

/** Row shape of `public.profiles`. */
export const profileRowSchema = z.object({
  id: uuidSchema,
  display_name: z.string().min(1).max(60),
  avatar_url: z.string().url().nullable(),
  bio: z.string().max(500).nullable(),
  neighborhood: z.string().max(80).nullable(),
  coarse_lat: z.number().nullable(),
  coarse_lng: z.number().nullable(),
  is_discoverable: z.boolean(),
  is_adult_confirmed: z.boolean(),
  onboarding_completed_at: nullableTimestampSchema,
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});
export type ProfileRow = z.infer<typeof profileRowSchema>;

/** Body for `PATCH /api/me`. Every field optional; identity fields are not editable here. */
export const profileUpdateSchema = z
  .object({
    display_name: z.string().trim().min(1).max(60),
    avatar_url: z.string().url().nullable(),
    bio: z.string().trim().max(500).nullable(),
    neighborhood: z.string().trim().max(80).nullable(),
    coarse_lat: coarseCoordinateSchema.nullable(),
    coarse_lng: coarseCoordinateSchema.nullable(),
    is_discoverable: z.boolean(),
    is_adult_confirmed: z.literal(true),
    onboarding_completed_at: nullableTimestampSchema,
  })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, { message: 'Provide at least one field to update' });
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

/** Public card exposed through the `profile_public_cards` view. */
export const profilePublicCardSchema = profileRowSchema.pick({
  id: true,
  display_name: true,
  avatar_url: true,
  bio: true,
  neighborhood: true,
});
export type ProfilePublicCard = z.infer<typeof profilePublicCardSchema>;

/** Body for `POST /api/auth/signup` style flows (used by the signup page server action). */
export const signupSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(72),
  display_name: z.string().trim().min(1).max(60),
  is_adult_confirmed: z.literal(true, { errorMap: () => ({ message: 'You must confirm you are 18 or older' }) }),
  as: z.enum(['consumer', 'business']).default('consumer'),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;
