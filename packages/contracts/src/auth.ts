import { z } from 'zod'

import { subscriptionSnapshotSchema } from './iap'
import { expoPushTokenSchema } from './notifications'

const displayNameSchema = z
  .union([z.string().trim().min(2).max(80), z.literal('')])
  .optional()
  .transform((value) => {
    if (value === '' || value === undefined) return undefined
    return value
  })

export const emailSchema = z.string().trim().toLowerCase().email().max(254)

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')

export const userSchema = z.object({
  id: z.string(),
  email: emailSchema,
  displayName: z.string().nullable(),
  createdAt: z.string().datetime(),
  subscription: subscriptionSnapshotSchema,
})

export const registerRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
})

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
})

export const socialAuthProviderSchema = z.enum(['apple', 'google'])

export const socialAuthProviderParamsSchema = z.object({
  provider: socialAuthProviderSchema,
})

export const socialAuthRequestSchema = z.object({
  idToken: z.string().trim().min(1).max(4096),
  displayName: displayNameSchema,
})

export const refreshRequestSchema = z
  .object({
    refreshToken: z.string().min(32).optional(),
  })
  .optional()
  .default({})

export const logoutRequestSchema = z
  .object({
    expoPushToken: expoPushTokenSchema.optional(),
    expoPushTokens: z.array(expoPushTokenSchema).max(20).optional(),
    refreshToken: z.string().min(32).optional(),
  })
  .optional()
  .default({})

export const authResponseSchema = z.object({
  user: userSchema,
  accessToken: z.string(),
  refreshToken: z.string().optional(),
})

export const refreshResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
})

export const meResponseSchema = z.object({
  user: userSchema,
})

export type UserDto = z.infer<typeof userSchema>
export type RegisterRequest = z.input<typeof registerRequestSchema>
export type RegisterPayload = z.output<typeof registerRequestSchema>
export type LoginRequest = z.infer<typeof loginRequestSchema>
export type SocialAuthProvider = z.infer<typeof socialAuthProviderSchema>
export type SocialAuthRequest = z.input<typeof socialAuthRequestSchema>
export type SocialAuthPayload = z.output<typeof socialAuthRequestSchema>
export type RefreshRequest = z.infer<typeof refreshRequestSchema>
export type LogoutRequest = z.infer<typeof logoutRequestSchema>
export type AuthResponse = z.infer<typeof authResponseSchema>
export type RefreshResponse = z.infer<typeof refreshResponseSchema>
export type MeResponse = z.infer<typeof meResponseSchema>
