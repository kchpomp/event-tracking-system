import { z } from 'zod'

// Limits shared by the form, the API and the database columns (users.*, ideas.*).
export const PROFILE_FIELD_MAX = 100
export const IDEA_SHORT_MAX = 200
export const IDEA_LONG_MAX = 5000
export const DIFFUSION_GOAL = 3 // connections that score and complete "Диффузия"
export const IDEA_GOAL = 5 // ideas that score and complete "Колба идей"
export const POLYMER_GROUP = 'polymer_solutions'

const requiredText = (max: number) => z.string().trim().min(1).max(max)
const tokenSchema = z.string().trim().min(1).max(512)

export const eventProfileSchema = z
  .object({
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    company: z.string().nullable(),
    city: z.string().nullable(),
    /** What the participant's own QR encodes; never sent about anyone else. */
    personalQrToken: z.string(),
  })
  .strict()

export const eventProgressSchema = z
  .object({
    totalPoints: z.number().int().nonnegative(),
    /** Raw counts: the client caps what it shows at IDEA_GOAL and DIFFUSION_GOAL. */
    ideasCount: z.number().int().nonnegative(),
    connectionsCount: z.number().int().nonnegative(),
  })
  .strict()

export const eventMeResponseSchema = z
  .object({ profile: eventProfileSchema, progress: eventProgressSchema })
  .strict()

export const stationSummarySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    points: z.number().int().nonnegative(),
    displayGroup: z.string().nullable(),
    visited: z.boolean(),
  })
  .strict()

export const stationsResponseSchema = z.object({ stations: z.array(stationSummarySchema) }).strict()

export const scanRequestSchema = z.object({ token: tokenSchema }).strict()

export const scanResponseSchema = z
  .object({
    pointsAwarded: z.number().int().nonnegative(),
    totalPoints: z.number().int().nonnegative(),
    alreadyCompleted: z.boolean(),
    successMessage: z.string().nullable(),
  })
  .strict()

export const connectRequestSchema = z.object({ token: tokenSchema }).strict()

export const connectResponseSchema = z
  .object({
    /** The caller's connections after the scan (raw, not capped). */
    connectionsCount: z.number().int().nonnegative(),
    alreadyConnected: z.boolean(),
  })
  .strict()

export const createIdeaRequestSchema = z
  .object({
    title: requiredText(IDEA_SHORT_MAX),
    direction: requiredText(IDEA_SHORT_MAX),
    problem: requiredText(IDEA_LONG_MAX),
    description: requiredText(IDEA_LONG_MAX),
    expectedResult: requiredText(IDEA_LONG_MAX),
  })
  .strict()

export const createIdeaResponseSchema = z
  .object({ ideasCount: z.number().int().positive() })
  .strict()

export const leaderboardEntrySchema = z
  .object({
    rank: z.number().int().positive(),
    fullName: z.string(),
    totalPoints: z.number().int().nonnegative(),
    isMe: z.boolean(),
  })
  .strict()

/** The top 10 plus the caller's own row when they are outside it (always last, with their rank). */
export const leaderboardResponseSchema = z
  .object({ entries: z.array(leaderboardEntrySchema) })
  .strict()

export const adminStationSchema = stationSummarySchema
  .omit({ visited: true })
  .extend({ isActive: z.boolean(), qrToken: z.string() })
  .strict()

export const adminStationsResponseSchema = z
  .object({
    event: z.object({ id: z.string(), isActive: z.boolean() }).strict().nullable(),
    stations: z.array(adminStationSchema),
  })
  .strict()

export const updateEventRequestSchema = z.object({ isActive: z.boolean() }).strict()
export const updateEventResponseSchema = z
  .object({ event: z.object({ id: z.string(), isActive: z.boolean() }).strict() })
  .strict()

export type EventProfile = z.infer<typeof eventProfileSchema>
export type EventProgress = z.infer<typeof eventProgressSchema>
export type EventMeResponse = z.infer<typeof eventMeResponseSchema>
export type StationSummary = z.infer<typeof stationSummarySchema>
export type StationsResponse = z.infer<typeof stationsResponseSchema>
export type ScanRequest = z.infer<typeof scanRequestSchema>
export type ScanResponse = z.infer<typeof scanResponseSchema>
export type ConnectRequest = z.infer<typeof connectRequestSchema>
export type ConnectResponse = z.infer<typeof connectResponseSchema>
export type CreateIdeaRequest = z.infer<typeof createIdeaRequestSchema>
export type CreateIdeaResponse = z.infer<typeof createIdeaResponseSchema>
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>
export type LeaderboardResponse = z.infer<typeof leaderboardResponseSchema>
export type AdminStation = z.infer<typeof adminStationSchema>
export type AdminStationsResponse = z.infer<typeof adminStationsResponseSchema>
export type UpdateEventRequest = z.infer<typeof updateEventRequestSchema>
export type UpdateEventResponse = z.infer<typeof updateEventResponseSchema>
