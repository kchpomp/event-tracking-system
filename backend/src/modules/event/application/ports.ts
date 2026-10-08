import type {
  AdminStationsResponse,
  ConnectResponse,
  CreateIdeaRequest,
  EventMeResponse,
  HostessAwardResponse,
  HostessParticipant,
  HostessParticipantResponse,
  LeaderboardEntry,
  ScanResponse,
  StationSummary,
} from '@event-tracking-system/contracts'

export type ParticipantReader = {
  /** The participant's own profile and numbers; null when the user does not exist. */
  participant(userId: string): Promise<EventMeResponse | null>
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
}

export type EventAdmin = {
  /** The latest event and every station WITH its qr token: administrators only. */
  stationsWithTokens(): Promise<AdminStationsResponse>
  /** Opens or closes scanning and/or sign-ups. Throws an EventFailure('not_found') when no event exists. */
  setEventState(input: {
    isActive?: boolean
    registrationOpen?: boolean
  }): Promise<{ id: string; isActive: boolean; registrationOpen: boolean }>
}

export type RegistrationReader = {
  /** Whether new accounts may be created. True when there is no event yet. */
  registrationOpen(): Promise<boolean>
}
