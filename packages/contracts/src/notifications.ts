import { z } from 'zod'

export const expoPushTokenSchema = z
  .string()
  .trim()
  .min(10)
  .max(512)
  .refine(
    (value) => /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(value),
    'Invalid Expo push token',
  )

export const pushTokenPlatformSchema = z.enum(['android', 'ios']).nullable().optional()

export const internalNotificationHrefSchema = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .refine(
    (value) =>
      value.startsWith('/') &&
      !value.startsWith('//') &&
      !value.includes('\\') &&
      !/^[a-z][a-z\d+.-]*:/i.test(value),
    'Notification href must be an internal app path',
  )

export const registerPushTokenRequestSchema = z.object({
  expoPushToken: expoPushTokenSchema,
  deviceId: z.string().trim().min(1).max(200).optional(),
  platform: pushTokenPlatformSchema,
})

export const unregisterPushTokenRequestSchema = z.object({
  expoPushToken: expoPushTokenSchema.optional(),
})

export const pushMutationResponseSchema = z.object({
  ok: z.literal(true),
})

export const testPushNotificationRequestSchema = z.preprocess(
  (value) => value ?? {},
  z.object({
    title: z.string().trim().min(1).max(80).default('Test notification'),
    body: z.string().trim().min(1).max(180).default('Expo Push is configured.'),
    href: internalNotificationHrefSchema.default('/'),
  }),
)

export const testPushNotificationResponseSchema = z.object({
  ok: z.literal(true),
  outboxId: z.string(),
})

export type RegisterPushTokenRequest = z.infer<typeof registerPushTokenRequestSchema>
export type UnregisterPushTokenRequest = z.infer<typeof unregisterPushTokenRequestSchema>
export type PushMutationResponse = z.infer<typeof pushMutationResponseSchema>
export type TestPushNotificationRequest = z.input<typeof testPushNotificationRequestSchema>
export type TestPushNotificationPayload = z.output<typeof testPushNotificationRequestSchema>
export type TestPushNotificationResponse = z.infer<typeof testPushNotificationResponseSchema>
