import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  HOSTESS_SEARCH_MIN,
  type ConnectRequest,
  type CreateIdeaRequest,
  type HostessAwardRequest,
  type HostessResolveRequest,
  type ImportPlannedRequest,
  type ScanRequest,
  type UpdateEventRequest,
} from '@event-tracking-system/contracts'

import { sessionQueryKeys, useAuth } from '@/features/auth'
import type { AuthenticatedTransport } from '@/platform/api'
import {
  awardStationToParticipant,
  connectParticipant,
  createIdea,
  getAdminStations,
  getEventMe,
  getHostessParticipant,
  getLeaderboard,
  getPlannedParticipants,
  getRegistrationReference,
  getRegistrationStatus,
  importPlannedParticipants,
  makeHostess,
  removePlannedParticipant,
  getStations,
  resolveParticipant,
  scanStation,
  searchParticipants,
  updateEvent,
} from './api'

// Under ['session', ...]: a session change cancels and removes everything a participant saw.
export const eventQueryKeys = {
  all: [...sessionQueryKeys.all, 'event'] as const,
  me: () => [...eventQueryKeys.all, 'me'] as const,
  stations: () => [...eventQueryKeys.all, 'stations'] as const,
  leaderboard: () => [...eventQueryKeys.all, 'leaderboard'] as const,
  adminStations: () => [...eventQueryKeys.all, 'admin-stations'] as const,
  // Outside ['session', ...] on purpose: it is read before anyone has a session, and a session
  // change would wipe it from under the sign-up page.
  registration: () => ['registration'] as const,
  registrationReference: () => ['registration', 'reference'] as const,
  planned: () => [...eventQueryKeys.all, 'planned'] as const,
  hostess: () => [...eventQueryKeys.all, 'hostess'] as const,
  hostessSearch: (q: string) => [...eventQueryKeys.hostess(), 'search', q] as const,
  hostessParticipant: (participantId: string) =>
    [...eventQueryKeys.hostess(), 'participant', participantId] as const,
}

export function eventMeQueryOptions(transport: AuthenticatedTransport) {
  return queryOptions({
    queryKey: eventQueryKeys.me(),
    queryFn: ({ signal }) => getEventMe(transport, { signal }),
  })
}

export function useEventMeQuery() {
  const { transport } = useAuth()
  return useQuery(eventMeQueryOptions(transport))
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
