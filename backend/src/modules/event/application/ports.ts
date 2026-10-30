import type {
  AdminStationsResponse,
  ConnectResponse,
  CreateIdeaRequest,
  EventMeResponse,
  HostessAwardResponse,
  HostessBadgeStatus,
  ParticipantBadge,
  HostessParticipant,
  HostessParticipantResponse,
  HostessTeamAwardResponse,
  ImportPlannedRequest,
  ImportPlannedResponse,
  LeaderboardEntry,
  NetworkResponse,
  PlannedParticipantsResponse,
  RegistrationReferenceResponse,
  ScanResponse,
  Live,
  ScheduledTeam,
  UpdateLiveRequest,
  AdminTeam,
  StationSummary,
  TeamMember,
  TeamsResponse,
  TeamMembersResponse,
} from '@event-tracking-system/contracts'

import type { PrivateStorage } from '../../../storage/port'

/** The provider-neutral storage port, as the uploads module uses it. */
export type { PrivateStorage }

export type ParticipantReader = {
  /** The participant's own profile and numbers (the photo is added by the service); null when the user does not exist. */
  participant(userId: string): Promise<{
    profile: Omit<EventMeResponse['profile'], 'photo'>
    progress: EventMeResponse['progress']
  } | null>
  /** The participant's badge progress, counted from the ledger. */
  badge(userId: string): Promise<ParticipantBadge>
}

export type TeamReader = {
  /** The caller's team and its members, best first (photos are added by the service); no team gives `team: null`. */
  teamMembers(userId: string): Promise<{
    team: TeamMembersResponse['team']
    members: Omit<TeamMember, 'photo' | 'isMe'>[]
  }>
  /** Every team with its member count, by name. */
  teams(): Promise<TeamsResponse['teams']>
  /** Every team with its slot, earliest start first; teams without a time last, then by name. */
  schedule(): Promise<ScheduledTeam[]>
  /** The administrator's live-team choice on the current event. */
  live(): Promise<Live>
}

export type PhotoSource = {
  userId: string
  firstName: string | null
  lastName: string | null
  /** Key of the user's own ready avatar. */
  avatarKey: string | null
  /** The photo on the guest-list row with the user's email, and the name listed there. */
  plannedKey: string | null
  plannedName: string | null
}

export type PhotoSourceReader = {
  photoSources(userIds: string[]): Promise<PhotoSource[]>
}

export type StationReader = {
  /** Active stations, oldest first, each marked visited for this participant. No tokens. */
  stations(userId: string): Promise<StationSummary[]>
}

export type StationScanner = {
  /** Scores a station QR once. Throws an EventFailure for an unknown, inactive or closed one. */
  scan(input: { participantId: string; token: string }): Promise<ScanResponse>
}

export type ConnectionMaker = {
  /** Connects the caller with the owner of a personal QR token. Throws an EventFailure. */
  connect(input: { participantId: string; token: string }): Promise<ConnectResponse>
}

export type IdeaWriter = {
  addIdea(input: CreateIdeaRequest & { authorId: string }): Promise<{ ideasCount: number }>
}

export type LeaderboardReader = {
  /** The top 10 plus the caller's own row when outside it, with competition ranks. */
  leaderboard(userId: string): Promise<LeaderboardEntry[]>
}

export type HostessDesk = {
  /** Participants (never staff) whose name, company, city or email contain every word; at most 20. */
  searchParticipants(query: string): Promise<HostessParticipant[]>
  /** The id behind a scanned personal QR token, or null for an unknown one or a staff account. */
  participantIdByToken(token: string): Promise<string | null>
  /** One participant with every active station marked visited for them; null when not a participant. */
  participantDetail(participantId: string): Promise<HostessParticipantResponse | null>
  /**
   * Awards a station to the participant exactly as their own scan would, and records who did it.
   * Throws an EventFailure for an unknown participant or station, an inactive station or a closed event.
   */
  awardStation(input: {
    participantId: string
    stationId: string
    awardedById: string
  }): Promise<HostessAwardResponse>
  /** The badge status of one participant; null when not a participant. */
  badgeStatus(participantId: string): Promise<HostessBadgeStatus | null>
  /**
   * Issues the badge once (one ledger row). Throws an EventFailure: `not_found`, `event_inactive`,
   * `badge_issued`, or `badge_not_eligible` with the Russian message.
   */
  issueBadge(input: { participantId: string; awardedById: string }): Promise<HostessBadgeStatus>
  /**
   * Gives `points` to every participant of the team in one transaction, once per `awardKey`: a
   * repeat of the key adds nothing and reports `awarded: 0`. Throws an EventFailure: `not_found`
   * for an unknown team, `team_empty` for a team without participants.
   */
  awardTeam(input: {
    teamId: string
    points: number
    awardKey: string
    awardedById: string
  }): Promise<HostessTeamAwardResponse>
}

export type EventAdmin = {
  /** The latest event and every station WITH its qr token: administrators only. */
  stationsWithTokens(): Promise<AdminStationsResponse>
  /** Opens or closes scanning and/or sign-ups. Throws an EventFailure('not_found') when no event exists. */
  setEventState(input: {
    isActive?: boolean
    registrationOpen?: boolean
  }): Promise<{ id: string; isActive: boolean; registrationOpen: boolean }>
  /** Every team with its member count and slot, by name. */
  adminTeams(): Promise<AdminTeam[]>
  /** Sets who performs now. Throws an EventFailure('not_found') for an unknown team or no event. */
  setLive(input: UpdateLiveRequest): Promise<Live>
  /** Replaces a team's slot (both times, or both null). Throws an EventFailure('not_found') for an unknown team. */
  setTeamSchedule(teamId: string, slot: { startsAt: string | null; endsAt: string | null }): Promise<AdminTeam>
}

export type RegistrationReader = {
  /** Whether new accounts may be created. True when there is no event yet. */
  registrationOpen(): Promise<boolean>
  /** The sign-up form's two dropdowns: the distinct departments and cities of the participant list, by name. */
  referenceLists(): Promise<RegistrationReferenceResponse>
}

export type PlannedParticipantsAdmin = {
  /** The whole expected guest list, people who have not signed up first, with the counts. */
  plannedParticipants(): Promise<PlannedParticipantsResponse>
  /**
   * Adds people to one of the two lists by email, or replaces the columns of one already listed.
   * Emails are unique across both lists: a person who is already in the other one moves to this
   * one. Every department and city becomes a `companies` / `cities` row the sign-up form can use.
   */
  importPlanned(
    kind: ImportPlannedRequest['kind'],
    entries: ImportPlannedRequest['entries'],
  ): Promise<ImportPlannedResponse>
  /** Null when no such entry exists, else its photo key (the caller deletes the file). Never touches an account. */
  removePlanned(id: string): Promise<{ photoObjectKey: string | null } | null>
  /** The listed rows among these lower-case emails. */
  plannedByEmails(emails: string[]): Promise<{ id: string; email: string; photoObjectKey: string | null }[]>
  /**
   * Points a row at a stored photo and returns the key it replaced. Null when the row is gone or
   * the key already belongs to another row.
   */
  setPhoto(
    id: string,
    photo: { objectKey: string; contentType: string; byteSize: number },
  ): Promise<{ previousKey: string | null } | null>
}

export type NetworkReader = {
  /** The latest ideas (oldest first) with the author's name parts, and the count of all ideas. No idea text. Photos are added by the service. */
  flask(): Promise<{
    total: number
    ideas: { id: string; createdAt: Date; author: { id: string; fullName: string; initials: string } }[]
  }>
  /** Every participant (never staff) with initials, and the connections between two participants (photos are added by the service). */
  network(): Promise<{ nodes: Omit<NetworkResponse['nodes'][number], 'photo'>[]; edges: NetworkResponse['edges'] }>
}
