import { z } from 'zod'

export const apiErrorCodeSchema = z.enum([
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'VALIDATION_ERROR',
  'AUTH_EMAIL_ALREADY_EXISTS',
  'PAYLOAD_TOO_LARGE',
  'RATE_LIMITED',
  'AUTH_PASSWORD_RESET_INVALID',
  'AUTH_EMAIL_VERIFICATION_INVALID',
  // Too many failed sign-ins for one address; answered with Retry-After until the window ends.
  'AUTH_LOGIN_LOCKED',
  // Staff roles (hostess, admin) go only to people whose email is verified.
  'EMAIL_NOT_VERIFIED',
  // Upload failures a client can actually recover from, kept apart from generic CONFLICT so the
  // UI can say what to do: retry the transfer, pick a different file, or start over.
  'UPLOAD_NOT_COMPLETED',
  'UPLOAD_REJECTED',
  'UPLOAD_EXPIRED',
  // Event participation: each is a different thing for the participant to do next, so the client
  // maps every code to its own Russian sentence instead of parsing a message.
  'EVENT_INVALID_STATION_TOKEN',
  'EVENT_STATION_INACTIVE',
  'EVENT_NOT_ACTIVE',
  'EVENT_TEAM_EMPTY',
  'BADGE_NOT_ELIGIBLE',
  'BADGE_ALREADY_ISSUED',
  'REGISTRATION_CLOSED',
  'DIFFUSION_INVALID_PARTICIPANT_TOKEN',
  'DIFFUSION_SELF',
  'DIFFUSION_SAME_CITY_AND_COMPANY',
  'INTERNAL_ERROR',
])

export const apiErrorSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
  }),
})

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>
export type ApiErrorResponse = z.infer<typeof apiErrorSchema>
