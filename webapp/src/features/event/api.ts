import {
  adminStationsResponseSchema,
  adminTeamSchema,
  avatarResponseSchema,
  createAvatarUploadRequestSchema,
  createAvatarUploadResponseSchema,
  adminTeamsResponseSchema,
  connectRequestSchema,
  connectResponseSchema,
  createIdeaRequestSchema,
  createIdeaResponseSchema,
  eventMeResponseSchema,
  hostessAwardRequestSchema,
  hostessBadgeStatusSchema,
  participantBadgeSchema,
  hostessAwardResponseSchema,
  hostessParticipantResponseSchema,
  hostessParticipantsResponseSchema,
  hostessResolveRequestSchema,
  hostessSearchQuerySchema,
  hostessTeamAwardRequestSchema,
  hostessTeamAwardResponseSchema,
  importPlannedRequestSchema,
  importPlannedResponseSchema,
  leaderboardResponseSchema,
  plannedPhotoFinalizeRequestSchema,
  plannedPhotoFinalizeResponseSchema,
  plannedPhotoTicketsRequestSchema,
  plannedPhotoTicketsResponseSchema,
  plannedParticipantsResponseSchema,
  registrationReferenceResponseSchema,
  registrationStatusResponseSchema,
  removePlannedResponseSchema,
  updateUserRoleRequestSchema,
  updateUserRoleResponseSchema,
  scanRequestSchema,
  scanResponseSchema,
  scheduleResponseSchema,
  stationsResponseSchema,
  teamMembersResponseSchema,
  teamsResponseSchema,
  updateEventRequestSchema,
  updateEventResponseSchema,
  updateLiveRequestSchema,
  updateLiveResponseSchema,
  updateTeamScheduleRequestSchema,
  type ConnectRequest,
  type CreateAvatarUploadRequest,
  type CreateIdeaRequest,
  type HostessAwardRequest,
  type HostessResolveRequest,
  type HostessTeamAwardRequest,
  type ImportPlannedRequest,
  type PlannedPhotoFinalizeRequest,
  type PlannedPhotoTicketsRequest,
  type ScanRequest,
  type UpdateEventRequest,
  type UpdateLiveRequest,
  type UpdateTeamScheduleRequest,
} from '@event-tracking-system/contracts'

import { HttpClient, type AuthenticatedTransport } from '@/platform/api'

type ReadOptions = { signal?: AbortSignal }

// Public, so it does not go through the session-aware transport: that one discards an answer that
// arrives while the session is still being worked out, which is exactly when the sign-up page asks.
const publicHttp = new HttpClient()

export function getRegistrationStatus(options: ReadOptions = {}) {
  return publicHttp.request('/api/registration', registrationStatusResponseSchema, options)
}

export function getRegistrationReference(options: ReadOptions = {}) {
  return publicHttp.request('/api/registration/reference', registrationReferenceResponseSchema, options)
}

export function getEventMe(transport: AuthenticatedTransport, options: ReadOptions = {}) {
  return transport.request('/api/event/me', eventMeResponseSchema, options)
}

export function getStations(transport: AuthenticatedTransport, options: ReadOptions = {}) {
  return transport.request('/api/event/stations', stationsResponseSchema, options)
}

export function getLeaderboard(transport: AuthenticatedTransport, options: ReadOptions = {}) {
  return transport.request('/api/event/leaderboard', leaderboardResponseSchema, options)
}

export function getTeamMembers(transport: AuthenticatedTransport, options: ReadOptions = {}) {
  return transport.request('/api/event/team/members', teamMembersResponseSchema, options)
}

export function getSchedule(transport: AuthenticatedTransport, options: ReadOptions = {}) {
  return transport.request('/api/event/schedule', scheduleResponseSchema, options)
}

export function getAdminTeams(transport: AuthenticatedTransport, options: ReadOptions = {}) {
  return transport.request('/api/admin/teams', adminTeamsResponseSchema, options)
}

export function updateTeamSchedule(
  transport: AuthenticatedTransport,
  teamId: string,
  input: UpdateTeamScheduleRequest,
) {
  return transport.request(`/api/admin/teams/${encodeURIComponent(teamId)}/schedule`, adminTeamSchema, {
    method: 'PUT',
    body: updateTeamScheduleRequestSchema.parse(input),
  })
}

export function updateLive(transport: AuthenticatedTransport, input: UpdateLiveRequest) {
  return transport.request('/api/admin/schedule/live', updateLiveResponseSchema, {
    method: 'PUT',
    body: updateLiveRequestSchema.parse(input),
  })
}

export function getHostessTeams(transport: AuthenticatedTransport, options: ReadOptions = {}) {
  return transport.request('/api/hostess/teams', teamsResponseSchema, options)
}

export function awardTeam(transport: AuthenticatedTransport, input: HostessTeamAwardRequest) {
  return transport.request('/api/hostess/team-award', hostessTeamAwardResponseSchema, {
    method: 'POST',
    body: hostessTeamAwardRequestSchema.parse(input),
  })
}

/** The participant's own photo: a ticket, a PUT straight to storage, then finalize. */
export function requestAvatarUpload(transport: AuthenticatedTransport, input: CreateAvatarUploadRequest) {
  return transport.request('/api/uploads/avatar', createAvatarUploadResponseSchema, {
    method: 'POST',
    body: createAvatarUploadRequestSchema.parse(input),
  })
}

export function finalizeAvatarUpload(transport: AuthenticatedTransport, uploadId: string) {
  return transport.request(`/api/uploads/avatar/${encodeURIComponent(uploadId)}/finalize`, avatarResponseSchema, {
    method: 'POST',
  })
}

export function getMyAvatar(transport: AuthenticatedTransport, options: ReadOptions = {}) {
  return transport.request('/api/uploads/avatar', avatarResponseSchema, options)
}

export function deleteMyAvatar(transport: AuthenticatedTransport) {
  return transport.request('/api/uploads/avatar', avatarResponseSchema, { method: 'DELETE' })
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

export function searchParticipants(
  transport: AuthenticatedTransport,
  q: string,
  options: ReadOptions = {},
) {
  const search = new URLSearchParams({ q: hostessSearchQuerySchema.parse({ q }).q })
  return transport.request(
    `/api/hostess/participants?${search}`,
    hostessParticipantsResponseSchema,
    options,
  )
}

export function resolveParticipant(transport: AuthenticatedTransport, input: HostessResolveRequest) {
  return transport.request('/api/hostess/participants/resolve', hostessParticipantResponseSchema, {
    method: 'POST',
    body: hostessResolveRequestSchema.parse(input),
  })
}

export function getHostessParticipant(
  transport: AuthenticatedTransport,
  participantId: string,
  options: ReadOptions = {},
) {
  return transport.request(
    `/api/hostess/participants/${encodeURIComponent(participantId)}`,
    hostessParticipantResponseSchema,
    options,
  )
}

export function awardStationToParticipant(
  transport: AuthenticatedTransport,
  input: HostessAwardRequest,
) {
  return transport.request('/api/hostess/awards', hostessAwardResponseSchema, {
    method: 'POST',
    body: hostessAwardRequestSchema.parse(input),
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

export function getPlannedParticipants(transport: AuthenticatedTransport, options: ReadOptions = {}) {
  return transport.request('/api/admin/planned-participants', plannedParticipantsResponseSchema, options)
}

export function importPlannedParticipants(
  transport: AuthenticatedTransport,
  input: ImportPlannedRequest,
) {
  return transport.request('/api/admin/planned-participants', importPlannedResponseSchema, {
    method: 'POST',
    body: importPlannedRequestSchema.parse(input),
  })
}

export function removePlannedParticipant(transport: AuthenticatedTransport, plannedId: string) {
  return transport.request(
    `/api/admin/planned-participants/${encodeURIComponent(plannedId)}`,
    removePlannedResponseSchema,
    { method: 'DELETE' },
  )
}

/** The same endpoint the users page uses; here for the one-button hostess role. */
export function makeHostess(transport: AuthenticatedTransport, userId: string) {
  return transport.request(
    `/api/admin/users/${encodeURIComponent(userId)}/role`,
    updateUserRoleResponseSchema,
    { method: 'PATCH', body: updateUserRoleRequestSchema.parse({ role: 'hostess' }) },
  )
}

export function requestPlannedPhotoTickets(
  transport: AuthenticatedTransport,
  input: PlannedPhotoTicketsRequest,
) {
  return transport.request('/api/admin/planned-participants/photos/tickets', plannedPhotoTicketsResponseSchema, {
    method: 'POST',
    body: plannedPhotoTicketsRequestSchema.parse(input),
  })
}

export function finalizePlannedPhotos(transport: AuthenticatedTransport, input: PlannedPhotoFinalizeRequest) {
  return transport.request('/api/admin/planned-participants/photos/finalize', plannedPhotoFinalizeResponseSchema, {
    method: 'POST',
    body: plannedPhotoFinalizeRequestSchema.parse(input),
  })
}

export function getMyBadge(transport: AuthenticatedTransport, options: ReadOptions = {}) {
  return transport.request('/api/event/badge', participantBadgeSchema, options)
}

export function getHostessBadge(
  transport: AuthenticatedTransport,
  participantId: string,
  options: ReadOptions = {},
) {
  return transport.request(
    `/api/hostess/participants/${encodeURIComponent(participantId)}/badge`,
    hostessBadgeStatusSchema,
    options,
  )
}

export function issueHostessBadge(transport: AuthenticatedTransport, participantId: string) {
  return transport.request(
    `/api/hostess/participants/${encodeURIComponent(participantId)}/badge`,
    hostessBadgeStatusSchema,
    { method: 'POST' },
  )
}
