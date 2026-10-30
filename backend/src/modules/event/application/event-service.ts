import type {
  ConnectRequest,
  CreateIdeaRequest,
  HostessAwardRequest,
  HostessTeamAwardRequest,
  ImportPlannedRequest,
  HostessResolveRequest,
  PlannedPhotoFinalizeRequest,
  PlannedPhotoFinalizeResponse,
  PlannedPhotoTicketsRequest,
  PlannedPhotoTicketsResponse,
  SignedPhoto,
  ScanRequest,
  UpdateEventRequest,
  UpdateLiveRequest,
  UpdateTeamScheduleRequest,
} from '@event-tracking-system/contracts'

import {
  PLANNED_PHOTO_MAX_BYTES,
  PLANNED_PHOTO_MIN_BYTES,
  plannedPhotoContentTypeSchema,
  scheduleProblem,
} from '@event-tracking-system/contracts'

import type { AuthenticatedPrincipal } from '../../auth'
import {
  detectImageFormat,
  imageFormatMatchesDeclaredType,
  imageSignatureByteLength,
} from '../../uploads'
import { EventFailure } from '../domain/errors'
import { listedNameMatches } from '../domain/rules'
import type {
  ConnectionMaker,
  EventAdmin,
  HostessDesk,
  IdeaWriter,
  LeaderboardReader,
  NetworkReader,
  ParticipantReader,
  PhotoSourceReader,
  PlannedParticipantsAdmin,
  PrivateStorage,
  RegistrationReader,
  StationReader,
  StationScanner,
  TeamReader,
} from './ports'

type EventServiceDependencies = {
  admin: EventAdmin
  connections: ConnectionMaker
  hostess: HostessDesk
  ideas: IdeaWriter
  leaderboard: LeaderboardReader
  network: NetworkReader
  newPhotoKey: (now: Date) => string
  /** Deletes that must not fail the request they belong to. */
  deferDelete: (objectKey: string) => void
  participants: ParticipantReader
  photoSources: PhotoSourceReader
  planned: PlannedParticipantsAdmin
  registration: RegistrationReader
  scanner: StationScanner
  stations: StationReader
  storage: PrivateStorage
  teams: TeamReader
}

/** Photos of lists and profiles are shown at once; the client asks again after this. */
const PHOTO_URL_TTL_SECONDS = 600

export class EventService {
  constructor(private readonly dependencies: EventServiceDependencies) {}

  async me(principal: AuthenticatedPrincipal) {
    const me = await this.dependencies.participants.participant(principal.id)
    if (!me) throw new EventFailure('not_found', 'Participant not found')
    const photo = (await this.userPhotos([principal.id])).get(principal.id) ?? null
    return { ...me, profile: { ...me.profile, photo } }
  }

  /**
   * The one rule for whose photo is shown, for the profile and for any list of people: the
   * user's own avatar, else the photo on the guest-list row with their email, but only while
   * the account's first and last name are the listed ones (a stranger who typed somebody's
   * email gets no face). Links are signed per call, short-lived, and only for signed-in callers.
   */
  async userPhotos(userIds: string[]): Promise<Map<string, SignedPhoto | null>> {
    const sources = await this.dependencies.photoSources.photoSources(userIds)
    const photos = new Map<string, SignedPhoto | null>(userIds.map((id) => [id, null]))
    await Promise.all(
      sources.map(async (source) => {
        const key =
          source.avatarKey ??
          (source.plannedKey && listedNameMatches(source.plannedName, source) ? source.plannedKey : null)
        if (!key) return
        const signed = await this.dependencies.storage.createDownloadUrl({
          key,
          expiresInSeconds: PHOTO_URL_TTL_SECONDS,
        })
        photos.set(source.userId, { url: signed.url, expiresAt: signed.expiresAt })
      }),
    )
    return photos
  }

  async myTeam(principal: AuthenticatedPrincipal) {
    const { team, members } = await this.dependencies.teams.teamMembers(principal.id)
    const photos = await this.userPhotos(members.map((member) => member.id))
    return {
      team,
      members: members.map((member) => ({
        ...member,
        photo: photos.get(member.id) ?? null,
        isMe: member.id === principal.id,
      })),
    }
  }

  async teams() {
    return { teams: await this.dependencies.teams.teams() }
  }

  async schedule() {
    const [teams, live] = await Promise.all([this.dependencies.teams.schedule(), this.dependencies.teams.live()])
    return { serverNow: new Date().toISOString(), teams, live }
  }

  setLive(input: UpdateLiveRequest) {
    return this.dependencies.admin.setLive(input)
  }

  async adminTeams() {
    return { teams: await this.dependencies.admin.adminTeams() }
  }

  setTeamSchedule(teamId: string, input: UpdateTeamScheduleRequest) {
    const problem = scheduleProblem(input.startsAt, input.endsAt)
    if (problem) throw new EventFailure('invalid_schedule', problem)
    return this.dependencies.admin.setTeamSchedule(teamId, input)
  }

  awardTeam(principal: AuthenticatedPrincipal, input: HostessTeamAwardRequest) {
    return this.dependencies.hostess.awardTeam({ ...input, awardedById: principal.id })
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

  async participantBadge(participantId: string) {
    const status = await this.dependencies.hostess.badgeStatus(participantId)
    if (!status) throw new EventFailure('not_found', 'Participant not found')
    return status
  }

  issueBadge(principal: AuthenticatedPrincipal, participantId: string) {
    return this.dependencies.hostess.issueBadge({ participantId, awardedById: principal.id })
  }

  myBadge(principal: AuthenticatedPrincipal) {
    return this.dependencies.participants.badge(principal.id)
  }

  adminStations() {
    return this.dependencies.admin.stationsWithTokens()
  }

  async updateEvent(input: UpdateEventRequest) {
    const event = await this.dependencies.admin.setEventState(input)
    this.publicReads.clear()
    return { event }
  }

  async network() {
    const { nodes, edges } = await this.dependencies.network.network()
    const photos = await this.userPhotos(nodes.map((node) => node.id))
    return { nodes: nodes.map((node) => ({ ...node, photo: photos.get(node.id) ?? null })), edges }
  }

  async flask() {
    const { total, ideas } = await this.dependencies.network.flask()
    const photos = await this.userPhotos(ideas.map((idea) => idea.author.id))
    return {
      serverNow: new Date().toISOString(),
      total,
      ideas: ideas.map(({ id, createdAt, author }) => ({
        id,
        createdAt: createdAt.toISOString(),
        participant: { fullName: author.fullName, initials: author.initials, photo: photos.get(author.id) ?? null },
      })),
    }
  }

  /**
   * The public sign-up page reads these two without a session, so a flood of GETs must not become
   * a flood of queries. One result answers for 3 s per process; this process's own writes (event
   * switch, list import) clear it at once. The registration gate on POST reads fresh.
   */
  private publicReads = new Map<'open' | 'reference', { at: number; value: Promise<unknown> }>()

  private publicRead<T>(key: 'open' | 'reference', load: () => Promise<T>): Promise<T> {
    const hit = this.publicReads.get(key)
    if (hit && Date.now() - hit.at < 3_000) return hit.value as Promise<T>
    const value = load()
    this.publicReads.set(key, { at: Date.now(), value })
    value.catch(() => this.publicReads.delete(key))
    return value
  }

  registrationOpen() {
    return this.dependencies.registration.registrationOpen()
  }

  cachedRegistrationOpen() {
    return this.publicRead('open', () => this.registrationOpen())
  }

  registrationReference() {
    return this.publicRead('reference', () => this.dependencies.registration.referenceLists())
  }

  plannedParticipants() {
    return this.dependencies.planned.plannedParticipants()
  }

  async importPlanned(input: ImportPlannedRequest) {
    // One row per email in a statement (a repeat would make the upsert fail); the last row wins.
    const byEmail = new Map(input.entries.map((entry) => [entry.email, entry]))
    try {
      return await this.dependencies.planned.importPlanned(input.kind, [...byEmail.values()])
    } finally {
      this.publicReads.clear() // an import can add companies and cities
    }
  }

  async removePlanned(plannedId: string) {
    const removed = await this.dependencies.planned.removePlanned(plannedId)
    if (!removed) throw new EventFailure('not_found', 'Planned participant not found')
    if (removed.photoObjectKey) this.dependencies.deferDelete(removed.photoObjectKey)
  }

  /** Fresh write-once upload tickets, one per photo; nothing is stored until finalize. */
  async photoTickets(input: PlannedPhotoTicketsRequest): Promise<PlannedPhotoTicketsResponse> {
    const listed = new Set(
      (await this.dependencies.planned.plannedByEmails(input.items.map((item) => item.email))).map(
        (row) => row.email,
      ),
    )
    const missing = input.items.filter((item) => !listed.has(item.email.trim().toLowerCase()))
    if (missing.length > 0) {
      throw new EventFailure('not_found', `Not in the guest list: ${missing.map((i) => i.email).join(', ')}`)
    }

    const now = new Date()
    return {
      tickets: await Promise.all(
        input.items.map(async (item) => {
          const objectKey = this.dependencies.newPhotoKey(now)
          const upload = await this.dependencies.storage.createUploadUrl({
            key: objectKey,
            contentType: item.contentType,
            byteSize: item.byteSize,
          })
          return {
            email: item.email.trim().toLowerCase(),
            objectKey,
            upload: {
              method: upload.method,
              url: upload.url,
              headers: upload.headers,
              contentLength: upload.contentLength,
              expiresAt: upload.expiresAt,
            },
          }
        }),
      ),
    }
  }

  /**
   * Checks what actually landed (size, type, leading bytes) and only then points the row at it.
   * One bad file does not fail the batch. Repeating a finalize that already succeeded is a no-op.
   */
  async finalizePhotos(input: PlannedPhotoFinalizeRequest): Promise<PlannedPhotoFinalizeResponse> {
    const { storage, planned } = this.dependencies
    const rows = new Map(
      (await planned.plannedByEmails(input.items.map((item) => item.email))).map((row) => [row.email, row]),
    )
    const results: PlannedPhotoFinalizeResponse['results'] = []
    for (const { email, objectKey } of input.items) {
      const status = await (async () => {
        const row = rows.get(email.trim().toLowerCase())
        if (!row) return 'not_listed' as const
        if (row.photoObjectKey === objectKey) return 'stored' as const
        if (!objectKey.startsWith('planned-photos/')) return 'rejected' as const

        const head = await storage.headObject(objectKey)
        if (!head) return 'not_uploaded' as const

        const declared = plannedPhotoContentTypeSchema.safeParse(head.contentType)
        const prefix = await storage.readRange(objectKey, { start: 0, end: imageSignatureByteLength - 1 })
        const detected = prefix ? detectImageFormat(prefix) : null
        if (
          !declared.success ||
          !detected ||
          !imageFormatMatchesDeclaredType(detected, declared.data) ||
          head.contentLength < PLANNED_PHOTO_MIN_BYTES ||
          head.contentLength > PLANNED_PHOTO_MAX_BYTES
        ) {
          this.dependencies.deferDelete(objectKey)
          return 'rejected' as const
        }

        const set = await planned.setPhoto(row.id, {
          objectKey,
          contentType: declared.data,
          byteSize: head.contentLength,
        })
        if (!set) return 'rejected' as const
        if (set.previousKey) this.dependencies.deferDelete(set.previousKey)
        return 'stored' as const
      })()
      results.push({ email: email.trim().toLowerCase(), status })
    }
    return { results }
  }
}
