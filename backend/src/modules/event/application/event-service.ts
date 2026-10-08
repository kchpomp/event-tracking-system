import type {
  ConnectRequest,
  CreateIdeaRequest,
  HostessAwardRequest,
  HostessResolveRequest,
  ScanRequest,
  UpdateEventRequest,
} from '@event-tracking-system/contracts'

import type { AuthenticatedPrincipal } from '../../auth'
import { EventFailure } from '../domain/errors'
import type {
  ConnectionMaker,
  EventAdmin,
  HostessDesk,
  IdeaWriter,
  LeaderboardReader,
  ParticipantReader,
  RegistrationReader,
  StationReader,
  StationScanner,
} from './ports'

type EventServiceDependencies = {
  admin: EventAdmin
  connections: ConnectionMaker
  hostess: HostessDesk
  ideas: IdeaWriter
  leaderboard: LeaderboardReader
  participants: ParticipantReader
  registration: RegistrationReader
  scanner: StationScanner
  stations: StationReader
}

export class EventService {
  constructor(private readonly dependencies: EventServiceDependencies) {}

  async me(principal: AuthenticatedPrincipal) {
    const me = await this.dependencies.participants.participant(principal.id)
    if (!me) throw new EventFailure('not_found', 'Participant not found')
    return me
  }

  async stations(principal: AuthenticatedPrincipal) {
    return { stations: await this.dependencies.stations.stations(principal.id) }
  }

  scan(principal: AuthenticatedPrincipal, input: ScanRequest) {
    return this.dependencies.scanner.scan({ participantId: principal.id, token: input.token })
  }

  connect(principal: AuthenticatedPrincipal, input: ConnectRequest) {
    return this.dependencies.connections.connect({
      participantId: principal.id,
      token: input.token,
    })
  }

  addIdea(principal: AuthenticatedPrincipal, input: CreateIdeaRequest) {
    return this.dependencies.ideas.addIdea({ ...input, authorId: principal.id })
  }

  async leaderboard(principal: AuthenticatedPrincipal) {
    return { entries: await this.dependencies.leaderboard.leaderboard(principal.id) }
  }

  async searchParticipants(query: string) {
    return { participants: await this.dependencies.hostess.searchParticipants(query) }
  }

  async participantByToken(input: HostessResolveRequest) {
    const participantId = await this.dependencies.hostess.participantIdByToken(input.token)
    if (!participantId) {
      throw new EventFailure('invalid_participant_token', 'Unknown participant code')
    }
    return this.participantDetail(participantId)
  }

  async participantDetail(participantId: string) {
    const detail = await this.dependencies.hostess.participantDetail(participantId)
    if (!detail) throw new EventFailure('not_found', 'Participant not found')
    return detail
  }

  awardStation(principal: AuthenticatedPrincipal, input: HostessAwardRequest) {
    return this.dependencies.hostess.awardStation({ ...input, awardedById: principal.id })
  }

  adminStations() {
    return this.dependencies.admin.stationsWithTokens()
  }

  async updateEvent(input: UpdateEventRequest) {
    return { event: await this.dependencies.admin.setEventState(input) }
  }

  registrationOpen() {
    return this.dependencies.registration.registrationOpen()
  }
}
