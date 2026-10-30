import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import {
  adminStationsResponseSchema,
  apiErrorSchema,
  connectRequestSchema,
  connectResponseSchema,
  createIdeaRequestSchema,
  createIdeaResponseSchema,
  eventMeResponseSchema,
  hostessAwardRequestSchema,
  hostessAwardResponseSchema,
  hostessBadgeStatusSchema,
  participantBadgeSchema,
  hostessTeamAwardRequestSchema,
  hostessTeamAwardResponseSchema,
  hostessParticipantParamsSchema,
  hostessParticipantResponseSchema,
  hostessParticipantsResponseSchema,
  hostessResolveRequestSchema,
  hostessSearchQuerySchema,
  importPlannedRequestSchema,
  importPlannedResponseSchema,
  leaderboardResponseSchema,
  flaskResponseSchema,
  networkResponseSchema,
  plannedParticipantParamsSchema,
  plannedPhotoFinalizeRequestSchema,
  plannedPhotoFinalizeResponseSchema,
  plannedPhotoTicketsRequestSchema,
  plannedPhotoTicketsResponseSchema,
  plannedParticipantsResponseSchema,
  registrationReferenceResponseSchema,
  removePlannedResponseSchema,
  registrationStatusResponseSchema,
  scanRequestSchema,
  scanResponseSchema,
  stationsResponseSchema,
  teamMembersResponseSchema,
  teamsResponseSchema,
  adminTeamsResponseSchema,
  scheduleResponseSchema,
  teamScheduleParamsSchema,
  updateLiveRequestSchema,
  updateLiveResponseSchema,
  updateTeamScheduleRequestSchema,
  adminTeamSchema,
  updateEventRequestSchema,
  updateEventResponseSchema,
} from '@event-tracking-system/contracts'
import type { Context, MiddlewareHandler } from 'hono'

import { AppError, errorResponse, validationErrorHook } from '../../../http/errors'
import { ingressErrorResponses, rateLimitErrorResponses } from '../../../http/openapi'
import type { AuthHttpEnv } from '../../auth'
import type { EventService } from '../application/event-service'
import { executeEvent } from './errors'

const errorContent = { 'application/json': { schema: apiErrorSchema } }
const bearerSecurity = [{ BearerAuth: [] }]
const authErrors = {
  401: { content: errorContent, description: 'Authentication required' },
  403: { content: errorContent, description: 'Not allowed for this account' },
}

const json = <T extends object>(schema: T) => ({ 'application/json': { schema } })

const meRoute = createRoute({
  method: 'get',
  path: '/me',
  security: bearerSecurity,
  responses: {
    200: { content: json(eventMeResponseSchema), description: 'Profile and progress' },
    ...authErrors,
  },
})

const stationsRoute = createRoute({
  method: 'get',
  path: '/stations',
  security: bearerSecurity,
  responses: {
    200: { content: json(stationsResponseSchema), description: 'Active stations' },
    ...authErrors,
  },
})

const scanRoute = createRoute({
  method: 'post',
  path: '/scan',
  security: bearerSecurity,
  request: { body: { content: json(scanRequestSchema) } },
  responses: {
    ...ingressErrorResponses,
    200: { content: json(scanResponseSchema), description: 'Scan result' },
    400: { content: errorContent, description: 'Invalid payload' },
    404: { content: errorContent, description: 'Unknown station code' },
    409: { content: errorContent, description: 'Station inactive or event closed' },
    ...authErrors,
  },
})

const connectRoute = createRoute({
  method: 'post',
  path: '/diffusion/connections',
  security: bearerSecurity,
  request: { body: { content: json(connectRequestSchema) } },
  responses: {
    ...ingressErrorResponses,
    200: { content: json(connectResponseSchema), description: 'Connection result' },
    400: { content: errorContent, description: 'Invalid payload' },
    404: { content: errorContent, description: 'Unknown participant code' },
    409: { content: errorContent, description: 'Connection not allowed' },
    ...authErrors,
  },
})

const ideaRoute = createRoute({
  method: 'post',
  path: '/ideas',
  security: bearerSecurity,
  request: { body: { content: json(createIdeaRequestSchema) } },
  responses: {
    ...ingressErrorResponses,
    201: { content: json(createIdeaResponseSchema), description: 'Idea accepted' },
    400: { content: errorContent, description: 'Invalid payload' },
    ...authErrors,
  },
})

const leaderboardRoute = createRoute({
  method: 'get',
  path: '/leaderboard',
  security: bearerSecurity,
  responses: {
    200: { content: json(leaderboardResponseSchema), description: 'Top 10 and the caller' },
    ...authErrors,
  },
})

const adminStationsRoute = createRoute({
  method: 'get',
  path: '/stations',
  security: bearerSecurity,
  responses: {
    200: { content: json(adminStationsResponseSchema), description: 'Stations with QR tokens' },
    ...authErrors,
  },
})

const updateEventRoute = createRoute({
  method: 'patch',
  path: '/event',
  security: bearerSecurity,
  request: { body: { content: json(updateEventRequestSchema) } },
  responses: {
    ...ingressErrorResponses,
    200: { content: json(updateEventResponseSchema), description: 'Updated event' },
    400: { content: errorContent, description: 'Invalid payload' },
    404: { content: errorContent, description: 'There is no event yet' },
    ...authErrors,
  },
})

const plannedListRoute = createRoute({
  method: 'get',
  path: '/planned-participants',
  security: bearerSecurity,
  responses: {
    200: { content: json(plannedParticipantsResponseSchema), description: 'Expected guest list' },
    ...authErrors,
  },
})

const plannedImportRoute = createRoute({
  method: 'post',
  path: '/planned-participants',
  security: bearerSecurity,
  request: { body: { content: json(importPlannedRequestSchema) } },
  responses: {
    ...ingressErrorResponses,
    200: { content: json(importPlannedResponseSchema), description: 'How many were added' },
    400: { content: errorContent, description: 'Invalid payload' },
    ...authErrors,
  },
})

const plannedDeleteRoute = createRoute({
  method: 'delete',
  path: '/planned-participants/{plannedId}',
  security: bearerSecurity,
  request: { params: plannedParticipantParamsSchema },
  responses: {
    ...ingressErrorResponses,
    200: { content: json(removePlannedResponseSchema), description: 'Removed from the list' },
    400: { content: errorContent, description: 'Invalid id' },
    404: { content: errorContent, description: 'No such entry' },
    ...authErrors,
  },
})

const plannedPhotoTicketsRoute = createRoute({
  method: 'post',
  path: '/planned-participants/photos/tickets',
  security: bearerSecurity,
  request: { body: { content: json(plannedPhotoTicketsRequestSchema) } },
  responses: {
    ...ingressErrorResponses,
    201: { content: json(plannedPhotoTicketsResponseSchema), description: 'One upload ticket per photo' },
    400: { content: errorContent, description: 'Invalid payload' },
    404: { content: errorContent, description: 'An email is not in the guest list' },
    ...authErrors,
  },
})

const plannedPhotoFinalizeRoute = createRoute({
  method: 'post',
  path: '/planned-participants/photos/finalize',
  security: bearerSecurity,
  request: { body: { content: json(plannedPhotoFinalizeRequestSchema) } },
  responses: {
    ...ingressErrorResponses,
    200: { content: json(plannedPhotoFinalizeResponseSchema), description: 'Outcome per photo' },
    400: { content: errorContent, description: 'Invalid payload' },
    ...authErrors,
  },
})

const adminNetworkRoute = createRoute({
  method: 'get',
  path: '/network',
  security: bearerSecurity,
  responses: {
    ...rateLimitErrorResponses,
    200: { content: json(networkResponseSchema), description: 'Participants and their connections' },
    ...authErrors,
  },
})

const adminFlaskRoute = createRoute({
  method: 'get',
  path: '/flask',
  security: bearerSecurity,
  responses: {
    ...rateLimitErrorResponses,
    200: { content: json(flaskResponseSchema), description: 'The latest ideas: who and when, never the text' },
    ...authErrors,
  },
})

const hostessSearchRoute = createRoute({
  method: 'get',
  path: '/participants',
  security: bearerSecurity,
  request: { query: hostessSearchQuerySchema },
  responses: {
    200: { content: json(hostessParticipantsResponseSchema), description: 'Matching participants' },
    400: { content: errorContent, description: 'Query too short or too long' },
    ...authErrors,
  },
})

const hostessResolveRoute = createRoute({
  method: 'post',
  path: '/participants/resolve',
  security: bearerSecurity,
  request: { body: { content: json(hostessResolveRequestSchema) } },
  responses: {
    ...ingressErrorResponses,
    200: { content: json(hostessParticipantResponseSchema), description: 'The scanned participant' },
    400: { content: errorContent, description: 'Invalid payload' },
    404: { content: errorContent, description: 'Unknown participant code' },
    ...authErrors,
  },
})

const hostessParticipantRoute = createRoute({
  method: 'get',
  path: '/participants/{participantId}',
  security: bearerSecurity,
  request: { params: hostessParticipantParamsSchema },
  responses: {
    200: { content: json(hostessParticipantResponseSchema), description: 'Participant and stations' },
    400: { content: errorContent, description: 'Invalid participant id' },
    404: { content: errorContent, description: 'Participant not found' },
    ...authErrors,
  },
})

const hostessBadgeRoute = createRoute({
  method: 'get',
  path: '/participants/{participantId}/badge',
  security: bearerSecurity,
  request: { params: hostessParticipantParamsSchema },
  responses: {
    200: { content: json(hostessBadgeStatusSchema), description: 'Badge progress and whether it is issued' },
    404: { content: errorContent, description: 'Participant not found' },
    ...authErrors,
  },
})

const hostessIssueBadgeRoute = createRoute({
  method: 'post',
  path: '/participants/{participantId}/badge',
  security: bearerSecurity,
  request: { params: hostessParticipantParamsSchema },
  responses: {
    ...ingressErrorResponses,
    201: { content: json(hostessBadgeStatusSchema), description: 'Badge issued' },
    404: { content: errorContent, description: 'Participant not found' },
    409: { content: errorContent, description: 'Not enough activities, already issued, or the event is closed' },
    ...authErrors,
  },
})

const myBadgeRoute = createRoute({
  method: 'get',
  path: '/badge',
  security: bearerSecurity,
  responses: {
    200: { content: json(participantBadgeSchema), description: 'The caller badge progress' },
    ...authErrors,
  },
})

const hostessAwardRoute = createRoute({
  method: 'post',
  path: '/awards',
  security: bearerSecurity,
  request: { body: { content: json(hostessAwardRequestSchema) } },
  responses: {
    ...ingressErrorResponses,
    200: { content: json(hostessAwardResponseSchema), description: 'Award result' },
    400: { content: errorContent, description: 'Invalid payload' },
    404: { content: errorContent, description: 'Unknown participant or station' },
    409: { content: errorContent, description: 'Station inactive or event closed' },
    ...authErrors,
  },
})

const teamMembersRoute = createRoute({
  method: 'get',
  path: '/team/members',
  security: bearerSecurity,
  responses: {
    200: { content: json(teamMembersResponseSchema), description: 'The caller\'s team and its members' },
    ...authErrors,
  },
})

const scheduleRoute = createRoute({
  method: 'get',
  path: '/schedule',
  security: bearerSecurity,
  responses: {
    200: { content: json(scheduleResponseSchema), description: 'Every team with its slot, and the server clock' },
    401: authErrors[401],
  },
})

const adminTeamsRoute = createRoute({
  method: 'get',
  path: '/teams',
  security: bearerSecurity,
  responses: {
    200: { content: json(adminTeamsResponseSchema), description: 'Every team with its member count and slot' },
    ...authErrors,
  },
})

const updateTeamScheduleRoute = createRoute({
  method: 'put',
  path: '/teams/{teamId}/schedule',
  security: bearerSecurity,
  request: {
    params: teamScheduleParamsSchema,
    body: { content: json(updateTeamScheduleRequestSchema) },
  },
  responses: {
    ...ingressErrorResponses,
    200: { content: json(adminTeamSchema), description: 'The team with its new slot' },
    400: { content: errorContent, description: 'One time only, or an end that is not after the start' },
    404: { content: errorContent, description: 'Unknown team' },
    ...authErrors,
  },
})

const updateLiveRoute = createRoute({
  method: 'put',
  path: '/schedule/live',
  security: bearerSecurity,
  request: { body: { content: json(updateLiveRequestSchema) } },
  responses: {
    ...ingressErrorResponses,
    200: { content: json(updateLiveResponseSchema), description: 'Who performs now' },
    404: { content: errorContent, description: 'Unknown team' },
    ...authErrors,
  },
})

const hostessTeamsRoute = createRoute({
  method: 'get',
  path: '/teams',
  security: bearerSecurity,
  responses: {
    200: { content: json(teamsResponseSchema), description: 'Every team with its member count' },
    ...authErrors,
  },
})

const hostessTeamAwardRoute = createRoute({
  method: 'post',
  path: '/team-award',
  security: bearerSecurity,
  request: { body: { content: json(hostessTeamAwardRequestSchema) } },
  responses: {
    ...ingressErrorResponses,
    200: { content: json(hostessTeamAwardResponseSchema), description: 'Award result; `awarded` is 0 on a retry' },
    400: { content: errorContent, description: 'Invalid payload' },
    404: { content: errorContent, description: 'Unknown team' },
    409: { content: errorContent, description: 'The team has no participants' },
    ...authErrors,
  },
})

const registrationStatusRoute = createRoute({
  method: 'get',
  path: '/',
  responses: {
    ...ingressErrorResponses,
    200: { content: json(registrationStatusResponseSchema), description: 'Whether sign-up is open' },
  },
})

const registrationReferenceRoute = createRoute({
  method: 'get',
  path: '/reference',
  responses: {
    ...ingressErrorResponses,
    200: { content: json(registrationReferenceResponseSchema), description: 'Companies and cities' },
  },
})

/** A rejected slot: the message names the problem (`Invalid request payload` would not tell the admin). */
function scheduleHook(
  result: { success: true } | { success: false; error: { issues: readonly { message: string; code: string }[] } },
  c: Context,
) {
  if (result.success) return
  const custom = result.error.issues.find((issue) => issue.code === 'custom')
  return c.json(
    errorResponse(
      'VALIDATION_ERROR',
      custom?.message ?? 'Invalid request payload',
      result.error.issues,
    ),
    400,
  )
}

/** A rejected list file: the first problems, each naming its data row (the header is not counted). */
function plannedImportHook(
  result: { success: true } | { success: false; error: { issues: readonly { path: PropertyKey[]; code: string; message: string; keys?: string[] }[] } },
  c: Context,
) {
  if (result.success) return
  const lines = result.error.issues.slice(0, 5).map((issue) => {
    const [root, index] = issue.path
    if (root !== 'entries') return `Не указан тип списка: нужен «participant» или «hostess»`
    if (typeof index !== 'number') return `Список: ${issue.message}`
    const problem =
      issue.code === 'unrecognized_keys'
        ? `лишняя колонка «${(issue.keys ?? []).join('», «')}»; нужны ровно пять: email, имя, фамилия, подразделение, город`
        : issue.message
    return `Строка ${index + 1}: ${problem}`
  })
  return c.json(
    errorResponse('VALIDATION_ERROR', lines.join('\n'), result.error.issues),
    400,
  )
}

type CreateEventRoutesOptions = {
  adminNetworkReadRateLimit: MiddlewareHandler<AuthHttpEnv>
  connectionRateLimit: MiddlewareHandler<AuthHttpEnv>
  ideaRateLimit: MiddlewareHandler<AuthHttpEnv>
  requireAdmin: MiddlewareHandler<AuthHttpEnv>
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  requireHostess: MiddlewareHandler<AuthHttpEnv>
  requireNetworkViewer: MiddlewareHandler<AuthHttpEnv>
  requireParticipant: MiddlewareHandler<AuthHttpEnv>
  service: EventService
}

export function createEventRoutes({
  adminNetworkReadRateLimit,
  connectionRateLimit,
  ideaRateLimit,
  requireAdmin,
  requireAuth,
  requireHostess,
  requireNetworkViewer,
  requireParticipant,
  service,
}: CreateEventRoutesOptions) {
  const participantRoutes = new OpenAPIHono<AuthHttpEnv>({ defaultHook: validationErrorHook })
  const hostessRoutes = new OpenAPIHono<AuthHttpEnv>({ defaultHook: validationErrorHook })
  const networkRoutes = new OpenAPIHono<AuthHttpEnv>({ defaultHook: validationErrorHook })
  const adminRoutes = new OpenAPIHono<AuthHttpEnv>({ defaultHook: validationErrorHook })
  const registrationRoutes = new OpenAPIHono({ defaultHook: validationErrorHook })

  participantRoutes.use('*', requireAuth)
  // Registered before the participant guard on purpose: every signed-in role sees the schedule.
  participantRoutes.openapi(scheduleRoute, async (c) => c.json(await service.schedule(), 200))
  participantRoutes.use('*', requireParticipant)
  participantRoutes.on('POST', '/diffusion/connections', connectionRateLimit)
  participantRoutes.on('POST', '/ideas', ideaRateLimit)
  participantRoutes.openapi(meRoute, async (c) =>
    c.json(await executeEvent(() => service.me(c.var.user)), 200),
  )
  participantRoutes.openapi(stationsRoute, async (c) => c.json(await service.stations(c.var.user), 200))
  participantRoutes.openapi(scanRoute, async (c) =>
    c.json(await executeEvent(() => service.scan(c.var.user, c.req.valid('json'))), 200),
  )
  participantRoutes.openapi(connectRoute, async (c) =>
    c.json(await executeEvent(() => service.connect(c.var.user, c.req.valid('json'))), 200),
  )
  participantRoutes.openapi(ideaRoute, async (c) =>
    c.json(await service.addIdea(c.var.user, c.req.valid('json')), 201),
  )
  participantRoutes.openapi(myBadgeRoute, async (c) => c.json(await service.myBadge(c.var.user), 200))
  participantRoutes.openapi(teamMembersRoute, async (c) => c.json(await service.myTeam(c.var.user), 200))
  participantRoutes.openapi(leaderboardRoute, async (c) =>
    c.json(await service.leaderboard(c.var.user), 200),
  )

  hostessRoutes.use('*', requireAuth)
  hostessRoutes.use('*', requireHostess)
  hostessRoutes.openapi(hostessSearchRoute, async (c) =>
    c.json(await service.searchParticipants(c.req.valid('query').q), 200),
  )
  hostessRoutes.openapi(hostessResolveRoute, async (c) =>
    c.json(await executeEvent(() => service.participantByToken(c.req.valid('json'))), 200),
  )
  hostessRoutes.openapi(hostessParticipantRoute, async (c) =>
    c.json(
      await executeEvent(() => service.participantDetail(c.req.valid('param').participantId)),
      200,
    ),
  )
  hostessRoutes.openapi(hostessBadgeRoute, async (c) =>
    c.json(await executeEvent(() => service.participantBadge(c.req.valid('param').participantId)), 200),
  )
  hostessRoutes.openapi(hostessIssueBadgeRoute, async (c) =>
    c.json(await executeEvent(() => service.issueBadge(c.var.user, c.req.valid('param').participantId)), 201),
  )
  hostessRoutes.openapi(hostessAwardRoute, async (c) =>
    c.json(await executeEvent(() => service.awardStation(c.var.user, c.req.valid('json'))), 200),
  )

  hostessRoutes.openapi(hostessTeamsRoute, async (c) => c.json(await service.teams(), 200))
  hostessRoutes.openapi(hostessTeamAwardRoute, async (c) =>
    c.json(await executeEvent(() => service.awardTeam(c.var.user, c.req.valid('json'))), 200),
  )

  // The venue screen polls this all day; its budget is per account (see app.ts).
  networkRoutes.use('*', requireAuth)
  networkRoutes.use('*', requireNetworkViewer)
  networkRoutes.use('/network', adminNetworkReadRateLimit)
  networkRoutes.use('/flask', adminNetworkReadRateLimit)
  networkRoutes.openapi(adminNetworkRoute, async (c) => c.json(await service.network(), 200))
  networkRoutes.openapi(adminFlaskRoute, async (c) => c.json(await service.flask(), 200))

  adminRoutes.use('*', requireAuth)
  adminRoutes.use('*', requireAdmin)
  adminRoutes.openapi(adminStationsRoute, async (c) => c.json(await service.adminStations(), 200))
  adminRoutes.openapi(updateEventRoute, async (c) =>
    c.json(await executeEvent(() => service.updateEvent(c.req.valid('json'))), 200),
  )
  adminRoutes.openapi(adminTeamsRoute, async (c) => c.json(await service.adminTeams(), 200))
  adminRoutes.openapi(
    updateTeamScheduleRoute,
    async (c) => {
      const { teamId } = c.req.valid('param')
      return c.json(await executeEvent(() => service.setTeamSchedule(teamId, c.req.valid('json'))), 200)
    },
    scheduleHook,
  )
  adminRoutes.openapi(updateLiveRoute, async (c) =>
    c.json(await executeEvent(() => service.setLive(c.req.valid('json'))), 200),
  )

  adminRoutes.openapi(plannedListRoute, async (c) =>
    c.json(await service.plannedParticipants(), 200),
  )
  adminRoutes.openapi(
    plannedImportRoute,
    async (c) => c.json(await service.importPlanned(c.req.valid('json')), 200),
    plannedImportHook,
  )
  adminRoutes.openapi(plannedPhotoTicketsRoute, async (c) =>
    c.json(await executeEvent(() => service.photoTickets(c.req.valid('json'))), 201),
  )
  adminRoutes.openapi(plannedPhotoFinalizeRoute, async (c) =>
    c.json(await executeEvent(() => service.finalizePhotos(c.req.valid('json'))), 200),
  )
  adminRoutes.openapi(plannedDeleteRoute, async (c) => {
    await executeEvent(() => service.removePlanned(c.req.valid('param').plannedId))
    return c.json({ removed: true as const }, 200)
  })

  // Public: no account exists yet when somebody opens the sign-up page.
  registrationRoutes.openapi(registrationStatusRoute, async (c) =>
    c.json({ open: await service.cachedRegistrationOpen() }, 200),
  )
  registrationRoutes.openapi(registrationReferenceRoute, async (c) =>
    c.json(await service.registrationReference(), 200),
  )

  // Stops new accounts while an administrator keeps sign-up closed. It guards creation only:
  // existing accounts still sign in. Mounted in front of the two register routes. When the
  // switch cannot be read the request goes on: registering needs the same database and fails
  // loudly there, and cheap rejections (origin, body shape) keep their place ahead of any query.
  const registrationGate: MiddlewareHandler = async (c, next) => {
    if (c.req.method === 'POST') {
      const open = await service.registrationOpen().catch(() => true)
      if (!open) throw new AppError(403, 'REGISTRATION_CLOSED', 'Registration is closed')
    }
    await next()
  }

  return { adminRoutes, hostessRoutes, networkRoutes, participantRoutes, registrationGate, registrationRoutes }
}
