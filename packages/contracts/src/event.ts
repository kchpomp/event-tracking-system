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

/** A short-lived signed link; the client asks again after `expiresAt`. */
export const signedPhotoSchema = z
  .object({ url: z.string().min(1).max(2048), expiresAt: z.string().datetime() })
  .strict()

export const eventProfileSchema = z
  .object({
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    company: z.string().nullable(),
    city: z.string().nullable(),
    /** What the participant's own QR encodes; never sent about anyone else. */
    personalQrToken: z.string(),
    /** Own avatar, else the photo on the guest list (email and name must match); null for initials. */
    photo: signedPhotoSchema.nullable(),
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

/** What an administrator can switch: scanning (`isActive`) and sign-ups (`registrationOpen`). */
export const eventStateSchema = z
  .object({ id: z.string(), isActive: z.boolean(), registrationOpen: z.boolean() })
  .strict()

export const adminStationSchema = stationSummarySchema
  .omit({ visited: true })
  .extend({ isActive: z.boolean(), qrToken: z.string() })
  .strict()

export const adminStationsResponseSchema = z
  .object({
    event: eventStateSchema.nullable(),
    stations: z.array(adminStationSchema),
  })
  .strict()

// ---- Hostesses: staff who help participants (find them, award a station on their behalf) ----

export const HOSTESS_SEARCH_MIN = 2
export const HOSTESS_SEARCH_MAX = 100
export const HOSTESS_SEARCH_LIMIT = 20

/** What staff see about a participant: enough to tell two people with one name apart. */
export const hostessParticipantSchema = z
  .object({
    id: z.string(),
    fullName: z.string(),
    company: z.string().nullable(),
    city: z.string().nullable(),
    totalPoints: z.number().int().nonnegative(),
  })
  .strict()

export const hostessSearchQuerySchema = z
  .object({ q: z.string().trim().min(HOSTESS_SEARCH_MIN).max(HOSTESS_SEARCH_MAX) })
  .strict()

export const hostessParticipantsResponseSchema = z
  .object({ participants: z.array(hostessParticipantSchema) })
  .strict()

export const hostessParticipantParamsSchema = z.object({ participantId: z.uuid() }).strict()

/** A scanned participant QR (the token of «Показать мой QR»). */
export const hostessResolveRequestSchema = z.object({ token: tokenSchema }).strict()

/** The participant and every active station, each marked visited for THAT participant. */
export const hostessParticipantResponseSchema = z
  .object({ participant: hostessParticipantSchema, stations: z.array(stationSummarySchema) })
  .strict()

export const hostessAwardRequestSchema = z
  .object({ participantId: z.uuid(), stationId: z.uuid() })
  .strict()

export const hostessAwardResponseSchema = z
  .object({
    pointsAwarded: z.number().int().nonnegative(),
    totalPoints: z.number().int().nonnegative(),
    alreadyCompleted: z.boolean(),
  })
  .strict()

export const updateEventRequestSchema = z
  .object({ isActive: z.boolean().optional(), registrationOpen: z.boolean().optional() })
  .strict()
  .refine((value) => value.isActive !== undefined || value.registrationOpen !== undefined, {
    message: 'Nothing to change',
  })
export const updateEventResponseSchema = z.object({ event: eventStateSchema }).strict()

/** One entry of a reference list (companies, cities) the sign-up form offers. */
export const referenceOptionSchema = z.object({ id: z.uuid(), name: z.string() }).strict()

/** Public: the two dropdowns of the sign-up form. */
export const registrationReferenceResponseSchema = z
  .object({
    companies: z.array(referenceOptionSchema),
    cities: z.array(referenceOptionSchema),
  })
  .strict()

// ---- The expected guest list (administrators) ----

export const PLANNED_IMPORT_MAX = 2000

export const plannedKindSchema = z.enum(['participant', 'hostess'])

export const plannedParticipantSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    fullName: z.string().nullable(),
    kind: plannedKindSchema,
    /** An account with this email exists. */
    registered: z.boolean(),
    registeredAt: z.string().datetime().nullable(),
    /** The account behind the address, for the one-button role assignment. */
    userId: z.string().nullable(),
    /** Its first and last name as typed at sign-up. */
    accountName: z.string().nullable(),
    /** The listed name holds both the first and the last name of the account; null without an account. */
    nameMatches: z.boolean().nullable(),
    /** The role of that account: a planned hostess has the role only after an administrator gives it. */
    // The same three values as `userRoleSchema` (auth.ts imports this file, so it cannot be imported back).
    role: z.enum(['user', 'admin', 'hostess']).nullable(),
    /** A photo is stored for this entry; the link itself is never listed. */
    hasPhoto: z.boolean(),
  })
  .strict()

/** Planned against actual for one of the two lists. */
export const plannedSummarySchema = z
  .object({
    /** People in the list. */
    planned: z.number().int().nonnegative(),
    /** Of them, people who have an account. */
    registered: z.number().int().nonnegative(),
    /** Every account that plays this part (role `user` for participants, `hostess` for hostesses). */
    actual: z.number().int().nonnegative(),
  })
  .strict()

/** Both lists (not paged: they are the size of one event) with the numbers the Overview shows. */
export const plannedParticipantsResponseSchema = z
  .object({
    items: z.array(plannedParticipantSchema),
    participants: plannedSummarySchema,
    hostesses: plannedSummarySchema,
  })
  .strict()

export const importPlannedRequestSchema = z
  .object({
    kind: plannedKindSchema,
    entries: z
      .array(
        z
          .object({
            email: z.string().trim().toLowerCase().email().max(254),
            fullName: z.string().trim().min(1).max(200).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(PLANNED_IMPORT_MAX),
  })
  .strict()

export const importPlannedResponseSchema = z
  .object({ added: z.number().int().nonnegative(), updated: z.number().int().nonnegative() })
  .strict()

export const removePlannedResponseSchema = z.object({ removed: z.literal(true) }).strict()

// Guest photos go straight to storage, in batches: ticket, PUT, finalize (like avatars).
export const PLANNED_PHOTO_BATCH_MAX = 50
export const PLANNED_PHOTO_MAX_BYTES = 5 * 1024 * 1024
export const PLANNED_PHOTO_MIN_BYTES = 64
export const plannedPhotoContentTypeSchema = z.enum(['image/jpeg', 'image/png', 'image/webp'])

const plannedEmailSchema = z.string().trim().toLowerCase().email().max(254)

export const plannedPhotoTicketsRequestSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            email: plannedEmailSchema,
            contentType: plannedPhotoContentTypeSchema,
            byteSize: z.number().int().min(PLANNED_PHOTO_MIN_BYTES).max(PLANNED_PHOTO_MAX_BYTES),
          })
          .strict(),
      )
      .min(1)
      .max(PLANNED_PHOTO_BATCH_MAX),
  })
  .strict()

export const plannedPhotoTicketsResponseSchema = z
  .object({
    tickets: z.array(
      z
        .object({
          email: z.string(),
          /** Send it back to finalize once the PUT has succeeded. */
          objectKey: z.string(),
          upload: z
            .object({
              method: z.literal('PUT'),
              url: z.string(),
              headers: z.record(z.string(), z.string()),
              contentLength: z.number().int(),
              expiresAt: z.string().datetime(),
            })
            .strict(),
        })
        .strict(),
    ),
  })
  .strict()

export const plannedPhotoFinalizeRequestSchema = z
  .object({
    items: z
      .array(
        z
          .object({ email: plannedEmailSchema, objectKey: z.string().trim().min(1).max(1024) })
          .strict(),
      )
      .min(1)
      .max(PLANNED_PHOTO_BATCH_MAX),
  })
  .strict()

export const plannedPhotoFinalizeResponseSchema = z
  .object({
    results: z.array(
      z
        .object({
          email: z.string(),
          status: z.enum(['stored', 'not_listed', 'not_uploaded', 'rejected']),
        })
        .strict(),
    ),
  })
  .strict()

export const plannedParticipantParamsSchema = z.object({ plannedId: z.uuid() }).strict()

/** Public: the sign-up page asks this before it shows the form. */
export const registrationStatusResponseSchema = z.object({ open: z.boolean() }).strict()
export type RegistrationStatusResponse = z.infer<typeof registrationStatusResponseSchema>

export type ReferenceOption = z.infer<typeof referenceOptionSchema>
export type RegistrationReferenceResponse = z.infer<typeof registrationReferenceResponseSchema>
export type PlannedPhotoTicketsRequest = z.input<typeof plannedPhotoTicketsRequestSchema>
export type PlannedPhotoTicketsResponse = z.infer<typeof plannedPhotoTicketsResponseSchema>
export type PlannedPhotoFinalizeRequest = z.input<typeof plannedPhotoFinalizeRequestSchema>
export type PlannedPhotoFinalizeResponse = z.infer<typeof plannedPhotoFinalizeResponseSchema>
export type SignedPhoto = z.infer<typeof signedPhotoSchema>
export type PlannedKind = z.infer<typeof plannedKindSchema>
export type PlannedParticipant = z.infer<typeof plannedParticipantSchema>
export type PlannedSummary = z.infer<typeof plannedSummarySchema>
export type PlannedParticipantsResponse = z.infer<typeof plannedParticipantsResponseSchema>
export type ImportPlannedRequest = z.input<typeof importPlannedRequestSchema>
export type ImportPlannedResponse = z.infer<typeof importPlannedResponseSchema>
export type RemovePlannedResponse = z.infer<typeof removePlannedResponseSchema>
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
export type HostessParticipant = z.infer<typeof hostessParticipantSchema>
export type HostessParticipantsResponse = z.infer<typeof hostessParticipantsResponseSchema>
export type HostessResolveRequest = z.infer<typeof hostessResolveRequestSchema>
export type HostessParticipantResponse = z.infer<typeof hostessParticipantResponseSchema>
export type HostessAwardRequest = z.infer<typeof hostessAwardRequestSchema>
export type HostessAwardResponse = z.infer<typeof hostessAwardResponseSchema>
export type UpdateEventRequest = z.infer<typeof updateEventRequestSchema>
export type UpdateEventResponse = z.infer<typeof updateEventResponseSchema>
