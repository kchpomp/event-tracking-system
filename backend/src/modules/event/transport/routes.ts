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
  hostessParticipantParamsSchema,
  hostessParticipantResponseSchema,
  hostessParticipantsResponseSchema,
  hostessResolveRequestSchema,
  hostessSearchQuerySchema,
  leaderboardResponseSchema,
  registrationStatusResponseSchema,
  scanRequestSchema,
  scanResponseSchema,
  stationsResponseSchema,
  updateEventRequestSchema,
  updateEventResponseSchema,
} from '@event-tracking-system/contracts'
import type { MiddlewareHandler } from 'hono'

import { AppError, validationErrorHook } from '../../../http/errors'
import { ingressErrorResponses } from '../../../http/openapi'
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

const registrationStatusRoute = createRoute({
  method: 'get',
  path: '/',
  responses: {
    ...ingressErrorResponses,
    200: { content: json(registrationStatusResponseSchema), description: 'Whether sign-up is open' },
  },
})

type CreateEventRoutesOptions = {
  requireAdmin: MiddlewareHandler<AuthHttpEnv>
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  requireHostess: MiddlewareHandler<AuthHttpEnv>
  requireParticipant: MiddlewareHandler<AuthHttpEnv>
  service: EventService
}

export function createEventRoutes({
  requireAdmin,
  requireAuth,
  requireHostess,
  requireParticipant,
  service,
}: CreateEventRoutesOptions) {
  const participantRoutes = new OpenAPIHono<AuthHttpEnv>({ defaultHook: validationErrorHook })
  const hostessRoutes = new OpenAPIHono<AuthHttpEnv>({ defaultHook: validationErrorHook })
  const adminRoutes = new OpenAPIHono<AuthHttpEnv>({ defaultHook: validationErrorHook })
  const registrationRoutes = new OpenAPIHono({ defaultHook: validationErrorHook })

  participantRoutes.use('*', requireAuth)
  participantRoutes.use('*', requireParticipant)
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
  hostessRoutes.openapi(hostessAwardRoute, async (c) =>
    c.json(await executeEvent(() => service.awardStation(c.var.user, c.req.valid('json'))), 200),
  )

  adminRoutes.use('*', requireAuth)
  adminRoutes.use('*', requireAdmin)
  adminRoutes.openapi(adminStationsRoute, async (c) => c.json(await service.adminStations(), 200))
  adminRoutes.openapi(updateEventRoute, async (c) =>
    c.json(await executeEvent(() => service.updateEvent(c.req.valid('json'))), 200),
  )

  // Public: no account exists yet when somebody opens the sign-up page.
  registrationRoutes.openapi(registrationStatusRoute, async (c) =>
    c.json({ open: await service.registrationOpen() }, 200),
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

  return { adminRoutes, hostessRoutes, participantRoutes, registrationGate, registrationRoutes }
}
