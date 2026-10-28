import type {
  ConnectRequest,
  CreateIdeaRequest,
  HostessAwardRequest,
  ImportPlannedRequest,
  HostessResolveRequest,
  PlannedPhotoFinalizeRequest,
  PlannedPhotoFinalizeResponse,
  PlannedPhotoTicketsRequest,
  PlannedPhotoTicketsResponse,
  SignedPhoto,
  ScanRequest,
  UpdateEventRequest,
} from '@event-tracking-system/contracts'

import { PLANNED_PHOTO_MAX_BYTES, PLANNED_PHOTO_MIN_BYTES, plannedPhotoContentTypeSchema } from '@event-tracking-system/contracts'

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

  network() {
    return this.dependencies.network.network()
  }

  registrationOpen() {
    return this.dependencies.registration.registrationOpen()
  }

  registrationReference() {
    return this.dependencies.registration.referenceLists()
  }

  plannedParticipants() {
    return this.dependencies.planned.plannedParticipants()
  }

  importPlanned(input: ImportPlannedRequest) {
    // One row per email in a statement (a repeat would make the upsert fail); the last name wins.
    const byEmail = new Map<string, { email: string; fullName?: string }>()
    for (const { email, fullName } of input.entries) {
      const key = email.trim().toLowerCase()
      byEmail.set(key, { email: key, fullName: fullName ?? byEmail.get(key)?.fullName })
    }
    return this.dependencies.planned.importPlanned(input.kind, [...byEmail.values()])
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
