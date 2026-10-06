import type {
  AdminStationsResponse,
  ConnectResponse,
  CreateIdeaRequest,
  EventMeResponse,
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

export type EventAdmin = {
  /** The latest event and every station WITH its qr token: administrators only. */
  stationsWithTokens(): Promise<AdminStationsResponse>
  /** Opens or closes scanning. Throws an EventFailure('not_found') when no event exists. */
  setEventActive(isActive: boolean): Promise<{ id: string; isActive: boolean }>
}
