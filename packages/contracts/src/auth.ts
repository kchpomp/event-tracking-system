import { z } from 'zod'

import { PROFILE_FIELD_MAX } from './event'
import { expoPushTokenSchema } from './notifications'

export const emailSchema = z.string().trim().toLowerCase().email().max(254)

export const passwordSchema = z
  .string()
  .min(8, 'Пароль должен содержать не менее 8 символов')
  .max(128, 'Пароль должен содержать не более 128 символов')

export const userRoleSchema = z.enum(['user', 'admin', 'hostess', 'screen'])

export const userSchema = z.object({
  id: z.string(),
  email: emailSchema,
  displayName: z.string().nullable(),
  role: userRoleSchema,
  /** Whether the person proved they own the address; an administrator can make only such people staff. */
  emailVerified: z.boolean(),
  createdAt: z.string().datetime(),
})

const profileTextSchema = z
  .string()
  .trim()
  .min(1, 'Заполните поле')
  .max(PROFILE_FIELD_MAX, `Не более ${PROFILE_FIELD_MAX} символов`)

// Event participant registration: the profile fields are the public name and the "Диффузия" rule
// (a different city or company; both are ids from the reference lists) and `consent` is the
// separate personal-data consent (152-ФЗ, ст. 9). The server rejects a sign-up without it, so it
// cannot be skipped by calling the API directly. `consentedAt` stamps it. The privacy policy is a
// published document, not something a person has to acknowledge, so it has no field here.
export const registerRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: profileTextSchema,
  lastName: profileTextSchema,
  // Required for a participant. A hostess, whose address the organisers listed as one, has none:
  // the server refuses a sign-up without them from any other address.
  companyId: z.uuid('Выберите предприятие').optional(),
  cityId: z.uuid('Выберите город').optional(),
  consent: z.literal(true, { error: 'Не получено соглашение на обработку персональных данных' }),
})

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
})


export const passwordResetRequestSchema = z.object({
  email: emailSchema,
})

export const passwordResetRequestResponseSchema = z.object({
  accepted: z.literal(true),
})

export const passwordResetConfirmRequestSchema = z.object({
  token: z.string().trim().min(43).max(256),
  password: passwordSchema,
})

export const emailVerificationRequestResponseSchema = passwordResetRequestResponseSchema

export const emailVerificationConfirmRequestSchema = z.object({
  token: z.string().trim().min(43).max(256),
})

export const cookieRefreshRequestSchema = z.object({}).strict().optional().default({})
export const cookieLogoutRequestSchema = z.object({}).strict().optional().default({})

export const tokenRefreshRequestSchema = z.object({
  refreshToken: z.string().min(32),
})

export const tokenLogoutRequestSchema = tokenRefreshRequestSchema.extend({
  expoPushToken: expoPushTokenSchema.optional(),
  expoPushTokens: z.array(expoPushTokenSchema).max(20).optional(),
})

export const cookieAuthResponseSchema = z
  .object({
    user: userSchema,
    accessToken: z.string(),
  })
  .strict()

export const tokenAuthResponseSchema = cookieAuthResponseSchema.extend({
  refreshToken: z.string(),
})

export const authSessionIdentitySchema = z
  .object({
    userId: z.string().min(1),
    sessionId: z.string().min(1),
  })
  .strict()

export const cookieRefreshResponseSchema = z
  .object({
    accessToken: z.string(),
  })
  .strict()
export const tokenRefreshResponseSchema = cookieRefreshResponseSchema.extend({
  refreshToken: z.string(),
})

export const meResponseSchema = z.object({ user: userSchema })

export type UserDto = z.infer<typeof userSchema>
export type UserRole = z.infer<typeof userRoleSchema>
export type RegisterRequest = z.input<typeof registerRequestSchema>
export type RegisterPayload = z.output<typeof registerRequestSchema>
export type LoginRequest = z.infer<typeof loginRequestSchema>
export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>
export type PasswordResetRequestResponse = z.infer<typeof passwordResetRequestResponseSchema>
export type PasswordResetConfirmRequest = z.infer<typeof passwordResetConfirmRequestSchema>
export type EmailVerificationRequestResponse = z.infer<typeof emailVerificationRequestResponseSchema>
export type EmailVerificationConfirmRequest = z.infer<typeof emailVerificationConfirmRequestSchema>
export type CookieRefreshRequest = z.infer<typeof cookieRefreshRequestSchema>
export type CookieLogoutRequest = z.infer<typeof cookieLogoutRequestSchema>
export type TokenRefreshRequest = z.infer<typeof tokenRefreshRequestSchema>
export type TokenLogoutRequest = z.infer<typeof tokenLogoutRequestSchema>
export type CookieAuthResponse = z.infer<typeof cookieAuthResponseSchema>
export type TokenAuthResponse = z.infer<typeof tokenAuthResponseSchema>
export type AuthSessionIdentity = z.infer<typeof authSessionIdentitySchema>
export type CookieRefreshResponse = z.infer<typeof cookieRefreshResponseSchema>
export type TokenRefreshResponse = z.infer<typeof tokenRefreshResponseSchema>
export type MeResponse = z.infer<typeof meResponseSchema>
