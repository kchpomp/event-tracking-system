import {
  adminStationsResponseSchema,
  connectRequestSchema,
  connectResponseSchema,
  createIdeaRequestSchema,
  createIdeaResponseSchema,
  eventMeResponseSchema,
  leaderboardResponseSchema,
  scanRequestSchema,
  scanResponseSchema,
  stationsResponseSchema,
  updateEventRequestSchema,
  updateEventResponseSchema,
  type ConnectRequest,
  type CreateIdeaRequest,
  type ScanRequest,
  type UpdateEventRequest,
} from '@event-tracking-system/contracts'

import type { AuthenticatedTransport } from '@/platform/api'

type ReadOptions = { signal?: AbortSignal }

export function getEventMe(transport: AuthenticatedTransport, options: ReadOptions = {}) {
  return transport.request('/api/event/me', eventMeResponseSchema, options)
}

export function getStations(transport: AuthenticatedTransport, options: ReadOptions = {}) {
  return transport.request('/api/event/stations', stationsResponseSchema, options)
}

export function getLeaderboard(transport: AuthenticatedTransport, options: ReadOptions = {}) {
  return transport.request('/api/event/leaderboard', leaderboardResponseSchema, options)
}

export function scanStation(transport: AuthenticatedTransport, input: ScanRequest) {
  return transport.request('/api/event/scan', scanResponseSchema, {
    method: 'POST',
    body: scanRequestSchema.parse(input),
  })
}

export function connectParticipant(transport: AuthenticatedTransport, input: ConnectRequest) {
  return transport.request('/api/event/diffusion/connections', connectResponseSchema, {
    method: 'POST',
    body: connectRequestSchema.parse(input),
  })
}

export function createIdea(transport: AuthenticatedTransport, input: CreateIdeaRequest) {
  return transport.request('/api/event/ideas', createIdeaResponseSchema, {
    method: 'POST',
    body: createIdeaRequestSchema.parse(input),
  })
}

export function getAdminStations(transport: AuthenticatedTransport, options: ReadOptions = {}) {
  return transport.request('/api/admin/stations', adminStationsResponseSchema, options)
}

export function updateEvent(transport: AuthenticatedTransport, input: UpdateEventRequest) {
  return transport.request('/api/admin/event', updateEventResponseSchema, {
    method: 'PATCH',
    body: updateEventRequestSchema.parse(input),
  })
}
