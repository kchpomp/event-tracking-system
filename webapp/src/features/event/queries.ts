import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  HOSTESS_SEARCH_MIN,
  type ConnectRequest,
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

import { sessionQueryKeys, useAuth } from '@/features/auth'
import type { AuthenticatedTransport } from '@/platform/api'
import {
  awardStationToParticipant,
  awardTeam,
  connectParticipant,
  createIdea,
  finalizePlannedPhotos,
  getAdminStations,
  getAdminTeams,
  getEventMe,
  getHostessBadge,
  getMyBadge,
  issueHostessBadge,
  getHostessParticipant,
  getHostessTeams,
  getLeaderboard,
  getPlannedParticipants,
  getRegistrationReference,
  getRegistrationStatus,
  importPlannedParticipants,
  makeHostess,
  removePlannedParticipant,
  requestPlannedPhotoTickets,
  getStations,
  getTeamMembers,
  getSchedule,
  resolveParticipant,
  scanStation,
  searchParticipants,
  updateEvent,
  updateLive,
  updateTeamSchedule,
} from './api'

// Under ['session', ...]: a session change cancels and removes everything a participant saw.
export const eventQueryKeys = {
  all: [...sessionQueryKeys.all, 'event'] as const,
  badge: () => [...eventQueryKeys.all, 'badge'] as const,
  me: () => [...eventQueryKeys.all, 'me'] as const,
  stations: () => [...eventQueryKeys.all, 'stations'] as const,
  teamMembers: () => [...eventQueryKeys.all, 'team-members'] as const,
  schedule: () => [...eventQueryKeys.all, 'schedule'] as const,
  adminTeams: () => [...eventQueryKeys.all, 'admin-teams'] as const,
  leaderboard: () => [...eventQueryKeys.all, 'leaderboard'] as const,
  adminStations: () => [...eventQueryKeys.all, 'admin-stations'] as const,
  // Outside ['session', ...] on purpose: it is read before anyone has a session, and a session
  // change would wipe it from under the sign-up page.
  registration: () => ['registration'] as const,
  registrationReference: () => ['registration', 'reference'] as const,
  planned: () => [...eventQueryKeys.all, 'planned'] as const,
  hostess: () => [...eventQueryKeys.all, 'hostess'] as const,
  hostessTeams: () => [...eventQueryKeys.hostess(), 'teams'] as const,
  hostessSearch: (q: string) => [...eventQueryKeys.hostess(), 'search', q] as const,
  hostessBadge: (participantId: string) => [...eventQueryKeys.hostess(), 'badge', participantId] as const,
  hostessParticipant: (participantId: string) =>
    [...eventQueryKeys.hostess(), 'participant', participantId] as const,
}

const PHOTO_REFRESH_MARGIN_MS = 30_000

export function eventMeQueryOptions(transport: AuthenticatedTransport) {
  return queryOptions({
    queryKey: eventQueryKeys.me(),
    queryFn: ({ signal }) => getEventMe(transport, { signal }),
    // The photo link is signed and short-lived: refetch a little before it expires.
    refetchInterval: (query) => {
      const expiresAt = query.state.data?.profile.photo?.expiresAt
      return expiresAt ? Math.max(Date.parse(expiresAt) - Date.now() - PHOTO_REFRESH_MARGIN_MS, 10_000) : false
    },
  })
}

export function useEventMeQuery() {
  const { transport } = useAuth()
  return useQuery(eventMeQueryOptions(transport))
}

/** The caller's team with photos, points and who is «me». Photo links are signed, so refetch before they expire. */
function teamMembersQueryOptions(transport: AuthenticatedTransport) {
  return queryOptions({
    queryKey: eventQueryKeys.teamMembers(),
    queryFn: ({ signal }) => getTeamMembers(transport, { signal }),
    refetchInterval: (query) => {
      const expiry = (query.state.data?.members ?? []).flatMap((member) =>
        member.photo ? [Date.parse(member.photo.expiresAt)] : [],
      )
      return expiry.length > 0
        ? Math.max(Math.min(...expiry) - Date.now() - PHOTO_REFRESH_MARGIN_MS, 10_000)
        : false
    },
  })
}

export function useTeamMembersQuery() {
  const { transport } = useAuth()
  return useQuery(teamMembersQueryOptions(transport))
}

const SCHEDULE_REFETCH_MS = 30_000

/** Every team with its slot and the server clock; `dataUpdatedAt` is the device time of that clock reading. */
export function useScheduleQuery() {
  const { transport } = useAuth()
  return useQuery(
    queryOptions({
      queryKey: eventQueryKeys.schedule(),
      queryFn: ({ signal }) => getSchedule(transport, { signal }),
      refetchInterval: SCHEDULE_REFETCH_MS,
    }),
  )
}

export function useAdminTeamsQuery() {
  const { transport } = useAuth()
  return useQuery(
    queryOptions({
      queryKey: eventQueryKeys.adminTeams(),
      queryFn: ({ signal }) => getAdminTeams(transport, { signal }),
    }),
  )
}

/** One team's slot; the participants' schedule refreshes too. The list updates from the answer. */
export function useUpdateTeamScheduleMutation() {
  const { transport } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ teamId, ...input }: UpdateTeamScheduleRequest & { teamId: string }) =>
      updateTeamSchedule(transport, teamId, input),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: eventQueryKeys.adminTeams() }),
        queryClient.invalidateQueries({ queryKey: eventQueryKeys.schedule() }),
      ]),
  })
}

/** Who performs now; the participants' schedule refreshes with the answer. */
export function useUpdateLiveMutation() {
  const { transport } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateLiveRequest) => updateLive(transport, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: eventQueryKeys.schedule() }),
  })
}

export function useHostessTeamsQuery() {
  const { transport } = useAuth()
  return useQuery(
    queryOptions({
      queryKey: eventQueryKeys.hostessTeams(),
      queryFn: ({ signal }) => getHostessTeams(transport, { signal }),
    }),
  )
}

/** The caller sends one `awardKey` per dialog and resends it on a retry: it never awards twice. */
export function useAwardTeamMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateEvent()
  return useMutation({
    mutationFn: (input: HostessTeamAwardRequest) => awardTeam(transport, input),
    // Points of every member changed: team lists, leaderboard and the hostess lookups.
    onSuccess: invalidate,
  })
}

export function useStationsQuery() {
  const { transport } = useAuth()
  return useQuery(
    queryOptions({
      queryKey: eventQueryKeys.stations(),
      queryFn: ({ signal }) => getStations(transport, { signal }),
    }),
  )
}

export function useLeaderboardQuery() {
  const { transport } = useAuth()
  return useQuery(
    queryOptions({
      queryKey: eventQueryKeys.leaderboard(),
      queryFn: ({ signal }) => getLeaderboard(transport, { signal }),
    }),
  )
}

// Every scoring action changes the progress, the station marks and the leaderboard at once.
function useInvalidateEvent() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: eventQueryKeys.all })
}

export function useScanMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateEvent()
  return useMutation({
    mutationFn: (input: ScanRequest) => scanStation(transport, input),
    onSuccess: invalidate,
  })
}

export function useConnectMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateEvent()
  return useMutation({
    mutationFn: (input: ConnectRequest) => connectParticipant(transport, input),
    onSuccess: invalidate,
  })
}

export function useCreateIdeaMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateEvent()
  return useMutation({
    mutationFn: (input: CreateIdeaRequest) => createIdea(transport, input),
    onSuccess: invalidate,
  })
}

/** Waits for HOSTESS_SEARCH_MIN characters: the server refuses a shorter query. */
export function useHostessSearchQuery(q: string) {
  const { transport } = useAuth()
  return useQuery(
    queryOptions({
      queryKey: eventQueryKeys.hostessSearch(q),
      queryFn: ({ signal }) => searchParticipants(transport, q, { signal }),
      enabled: q.length >= HOSTESS_SEARCH_MIN,
    }),
  )
}

export function useHostessParticipantQuery(participantId: string) {
  const { transport } = useAuth()
  return useQuery(
    queryOptions({
      queryKey: eventQueryKeys.hostessParticipant(participantId),
      queryFn: ({ signal }) => getHostessParticipant(transport, participantId, { signal }),
    }),
  )
}

export function useResolveParticipantMutation() {
  const { transport } = useAuth()
  return useMutation({
    mutationFn: (input: HostessResolveRequest) => resolveParticipant(transport, input),
  })
}

export function useAwardStationMutation() {
  const { transport } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: HostessAwardRequest) => awardStationToParticipant(transport, input),
    // The participant's points and station marks, and every search row that shows their points.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: eventQueryKeys.hostess() }),
  })
}

export function useAdminStationsQuery() {
  const { transport } = useAuth()
  return useQuery(
    queryOptions({
      queryKey: eventQueryKeys.adminStations(),
      queryFn: ({ signal }) => getAdminStations(transport, { signal }),
    }),
  )
}

/** Switches scanning and/or sign-ups; the admin page and the sign-up status both refresh. */
export function useUpdateEventMutation() {
  const { transport } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateEventRequest) => updateEvent(transport, input),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: eventQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: eventQueryKeys.registration() }),
      ]),
  })
}

/** Whether new accounts may be created. Anything but a clear "closed" keeps the form visible. */
export function useRegistrationStatusQuery() {
  return useQuery(
    queryOptions({
      queryKey: eventQueryKeys.registration(),
      queryFn: ({ signal }) => getRegistrationStatus({ signal }),
    }),
  )
}

/** The sign-up form's company and city lists. The lists are static, so they are kept for the session. */
export function useRegistrationReferenceQuery() {
  return useQuery(
    queryOptions({
      queryKey: eventQueryKeys.registrationReference(),
      queryFn: ({ signal }) => getRegistrationReference({ signal }),
      staleTime: Infinity,
    }),
  )
}

/** The expected guest list with who has signed up (administrators). */
export function usePlannedParticipantsQuery() {
  const { transport } = useAuth()
  return useQuery(
    queryOptions({
      queryKey: eventQueryKeys.planned(),
      queryFn: ({ signal }) => getPlannedParticipants(transport, { signal }),
    }),
  )
}

export function useImportPlannedMutation() {
  const { transport } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ImportPlannedRequest) => importPlannedParticipants(transport, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: eventQueryKeys.planned() }),
  })
}

export function useRemovePlannedMutation() {
  const { transport } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (plannedId: string) => removePlannedParticipant(transport, plannedId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: eventQueryKeys.planned() }),
  })
}

export function usePlannedPhotoApi() {
  const { transport } = useAuth()
  const queryClient = useQueryClient()
  return {
    tickets: (input: PlannedPhotoTicketsRequest) => requestPlannedPhotoTickets(transport, input),
    finalize: (input: PlannedPhotoFinalizeRequest) => finalizePlannedPhotos(transport, input),
    refresh: () => queryClient.invalidateQueries({ queryKey: eventQueryKeys.planned() }),
  }
}

/** Gives a registered person the hostess role. Sessions of that person end, so lists refresh. */
export function useMakeHostessMutation() {
  const { transport } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => makeHostess(transport, userId),
    // The users page and its counts live under the session key too.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionQueryKeys.all }),
  })
}

const BADGE_REFETCH_MS = 3_000

/** The participant's badge progress; refetches every 3 s while a component uses it. */
export function useBadgeQuery() {
  const { transport } = useAuth()
  return useQuery(
    queryOptions({
      queryKey: eventQueryKeys.badge(),
      queryFn: ({ signal }) => getMyBadge(transport, { signal }),
      refetchInterval: BADGE_REFETCH_MS,
    }),
  )
}

/** A scanned participant's badge status. `gcTime: 0`: a second scan of the same person reads it fresh. */
export function useHostessBadgeQuery(participantId: string | null) {
  const { transport } = useAuth()
  return useQuery(
    queryOptions({
      queryKey: eventQueryKeys.hostessBadge(participantId ?? ''),
      queryFn: ({ signal }) => getHostessBadge(transport, participantId!, { signal }),
      enabled: participantId !== null,
      gcTime: 0,
    }),
  )
}

export function useIssueBadgeMutation() {
  const { transport } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (participantId: string) => issueHostessBadge(transport, participantId),
    // The point is added: the hostess lookups, the leaderboard and the participant's totals change.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: eventQueryKeys.all }),
  })
}
