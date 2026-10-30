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

/** A team of participants; a participant belongs to at most one. */
export const teamSchema = z.object({ id: z.string(), name: z.string() }).strict()

export const eventProfileSchema = z
  .object({
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    company: z.string().nullable(),
    city: z.string().nullable(),
    team: teamSchema.nullable(),
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

/** One member of the caller's team. `firstName` and `lastName` are the source of the initials. */
export const teamMemberSchema = z
  .object({
    id: z.string(),
    fullName: z.string(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    /** Same rule as the profile: own avatar, else the guest-list photo; null for initials. */
    photo: signedPhotoSchema.nullable(),
    totalPoints: z.number().int().nonnegative(),
    isMe: z.boolean(),
  })
  .strict()

/** `team` is null (and `members` empty) for a participant without a team. */
export const teamMembersResponseSchema = z
  .object({ team: teamSchema.nullable(), members: z.array(teamMemberSchema) })
  .strict()

export const teamSummarySchema = teamSchema.extend({ memberCount: z.number().int().nonnegative() }).strict()

export const teamsResponseSchema = z.object({ teams: z.array(teamSummarySchema) }).strict()

const instantSchema = z.string().datetime({ offset: true })

/** One team's performance slot; both times are null while it has none. */
export const scheduledTeamSchema = teamSchema
  .extend({ startsAt: instantSchema.nullable(), endsAt: instantSchema.nullable() })
  .strict()

/** `serverNow` lets a client place "performing now" and the 10-minute reminder on the server clock. */
/**
 * Who performs now. `override: false` is automatic: a team is live while `startsAt <= now < endsAt`
 * (the client computes it from `serverNow`). `override: true` means exactly `teamId` is live, or
 * nobody when it is null (also after the live team is deleted).
 */
export const liveSchema = z.object({ override: z.boolean(), teamId: z.uuid().nullable() }).strict()

export const scheduleResponseSchema = z
  .object({ serverNow: instantSchema, teams: z.array(scheduledTeamSchema), live: liveSchema })
  .strict()

/** An administrator's choice: automatic, nobody, or one team. */
export const updateLiveRequestSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('auto') }).strict(),
  z.object({ mode: z.literal('none') }).strict(),
  z.object({ mode: z.literal('team'), teamId: z.uuid() }).strict(),
])
export const updateLiveResponseSchema = liveSchema

export const adminTeamSchema = scheduledTeamSchema
  .extend({ memberCount: z.number().int().nonnegative() })
  .strict()
export const adminTeamsResponseSchema = z.object({ teams: z.array(adminTeamSchema) }).strict()

export const teamScheduleParamsSchema = z.object({ teamId: z.uuid() }).strict()

export const SCHEDULE_BOTH_OR_NONE_MESSAGE = 'Укажите и начало, и конец выступления, либо очистите оба времени'
export const SCHEDULE_ORDER_MESSAGE = 'Конец выступления должен быть позже его начала'

/** Both times, or neither (which clears the slot); the end is after the start. */
export function scheduleProblem(startsAt: string | null, endsAt: string | null): string | null {
  if ((startsAt === null) !== (endsAt === null)) return SCHEDULE_BOTH_OR_NONE_MESSAGE
  if (startsAt !== null && endsAt !== null && Date.parse(endsAt) <= Date.parse(startsAt)) {
    return SCHEDULE_ORDER_MESSAGE
  }
  return null
}

export const updateTeamScheduleRequestSchema = z
  .object({ startsAt: instantSchema.nullable(), endsAt: instantSchema.nullable() })
  .strict()
  .superRefine((value, ctx) => {
    const message = scheduleProblem(value.startsAt, value.endsAt)
    if (message) ctx.addIssue({ code: 'custom', message, path: ['endsAt'] })
  })

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

/** The merch «Значок»: how far a person got, whether it is issued, and the points it gave. */
export const badgeStatusSchema = z
  .object({
    completed: z.number().int().nonnegative(),
    required: z.number().int().positive(),
    eligible: z.boolean(),
    issued: z.boolean(),
    points: z.number().int().nonnegative(),
  })
  .strict()

export const hostessBadgeStatusSchema = badgeStatusSchema
  .extend({ participant: z.object({ id: z.string(), fullName: z.string() }).strict() })
  .strict()

/** `activities` names what was counted: station names, «Полимер решений», «Диффузия», «Колба идей». */
export const participantBadgeSchema = badgeStatusSchema
  .extend({ activities: z.array(z.object({ name: z.string() }).strict()) })
  .strict()

export const TEAM_AWARD_MIN_POINTS = 1
export const TEAM_AWARD_MAX_POINTS = 50

/** `awardKey` is made once per button press and resent on a retry: the same key never awards twice. */
export const hostessTeamAwardRequestSchema = z
  .object({
    teamId: z.uuid(),
    points: z.number().int().min(TEAM_AWARD_MIN_POINTS).max(TEAM_AWARD_MAX_POINTS),
    awardKey: z.uuid(),
  })
  .strict()

export const hostessTeamAwardResponseSchema = z
  .object({
    teamId: z.string(),
    points: z.number().int().positive(),
    /** Members of the team now. */
    memberCount: z.number().int().positive(),
    /** Members who got the points by THIS call; 0 on a retry with the same key. */
    awarded: z.number().int().nonnegative(),
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
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    department: z.string().nullable(),
    city: z.string().nullable(),
    kind: plannedKindSchema,
    /** An account with this email exists. */
    registered: z.boolean(),
    registeredAt: z.string().datetime().nullable(),
    /** The account behind the address, for the one-button role assignment. */
    userId: z.string().nullable(),
    /** Its first and last name as typed at sign-up. */
    accountName: z.string().nullable(),
    /** The listed first and last name hold both names of the account; null without an account. */
    nameMatches: z.boolean().nullable(),
    /** The role of that account: a planned hostess has the role only after an administrator gives it. */
    // The same values as `userRoleSchema` (auth.ts imports this file, so it cannot be imported back).
    role: z.enum(['user', 'admin', 'hostess', 'screen']).nullable(),
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

export const PLANNED_NAME_MAX = 100

// The five columns of the list file. The messages are shown to the administrator as they are.
const plannedText = (label: string) =>
  z
    .string({ error: `нет колонки «${label}» или она не текст` })
    .trim()
    .min(1, `колонка «${label}» пуста`)
    .max(PLANNED_NAME_MAX, `колонка «${label}» длиннее ${PLANNED_NAME_MAX} символов`)

export const plannedEntrySchema = z
  .object({
    email: z
      .string({ error: 'нет колонки «email» или она не текст' })
      .trim()
      .toLowerCase()
      .max(254, 'колонка «email» слишком длинная')
      .email('в колонке «email» не адрес почты'),
    firstName: plannedText('имя'),
    lastName: plannedText('фамилия'),
    department: plannedText('подразделение'),
    city: plannedText('город'),
  })
  .strict()

export const importPlannedRequestSchema = z
  .object({
    kind: plannedKindSchema,
    entries: z
      .array(plannedEntrySchema)
      .min(1, 'список пуст')
      .max(PLANNED_IMPORT_MAX, `в списке больше ${PLANNED_IMPORT_MAX} строк`),
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

/** The shape of a key the backend issues: `planned-photos/YYYY/MM/<uuid>`. */
const plannedPhotoObjectKeySchema = z
  .string()
  .regex(/^planned-photos\/\d{4}\/\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)

export const plannedPhotoFinalizeRequestSchema = z
  .object({
    items: z
      .array(
        z
          .object({ email: plannedEmailSchema, objectKey: plannedPhotoObjectKeySchema })
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
export type Team = z.infer<typeof teamSchema>
export type TeamMember = z.infer<typeof teamMemberSchema>
export type TeamMembersResponse = z.infer<typeof teamMembersResponseSchema>
export type TeamSummary = z.infer<typeof teamSummarySchema>
export type TeamsResponse = z.infer<typeof teamsResponseSchema>
export type ScheduledTeam = z.infer<typeof scheduledTeamSchema>
export type Live = z.infer<typeof liveSchema>
export type UpdateLiveRequest = z.infer<typeof updateLiveRequestSchema>
export type ScheduleResponse = z.infer<typeof scheduleResponseSchema>
export type AdminTeam = z.infer<typeof adminTeamSchema>
export type AdminTeamsResponse = z.infer<typeof adminTeamsResponseSchema>
export type UpdateTeamScheduleRequest = z.infer<typeof updateTeamScheduleRequestSchema>
export type HostessTeamAwardRequest = z.infer<typeof hostessTeamAwardRequestSchema>
export type HostessTeamAwardResponse = z.infer<typeof hostessTeamAwardResponseSchema>
export type PlannedEntry = z.input<typeof plannedEntrySchema>
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
export type BadgeStatus = z.infer<typeof badgeStatusSchema>
export type HostessBadgeStatus = z.infer<typeof hostessBadgeStatusSchema>
export type ParticipantBadge = z.infer<typeof participantBadgeSchema>
export type UpdateEventRequest = z.infer<typeof updateEventRequestSchema>
export type UpdateEventResponse = z.infer<typeof updateEventResponseSchema>
