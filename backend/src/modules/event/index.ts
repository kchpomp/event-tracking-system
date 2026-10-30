import type { MiddlewareHandler } from 'hono'

import type { TaskDeferrer } from '../../background-tasks'
import type { DbClient } from '../../db'
import { createStorageObjectKey, type PrivateStorage } from '../../storage'
import type { AuthHttpEnv } from '../auth'
import { EventService } from './application/event-service'
import { createPrismaEventRepository } from './infrastructure/event-repository'
import { createPrismaNetworkReader } from './infrastructure/network-reader'
import { createEventRoutes } from './transport/routes'

type CreateEventModuleOptions = {
  /** Runs after the admin check on the network screen route, keyed by the administrator. */
  adminNetworkReadRateLimit: MiddlewareHandler<AuthHttpEnv>
  backgroundTasks: TaskDeferrer
  /** Per participant, after the participant check. */
  connectionRateLimit: MiddlewareHandler<AuthHttpEnv>
  ideaRateLimit: MiddlewareHandler<AuthHttpEnv>
  db: DbClient
  requireAdmin: MiddlewareHandler<AuthHttpEnv>
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  requireHostess: MiddlewareHandler<AuthHttpEnv>
  requireNetworkViewer: MiddlewareHandler<AuthHttpEnv>
  requireParticipant: MiddlewareHandler<AuthHttpEnv>
  storage: PrivateStorage
}

export function createEventModule(options: CreateEventModuleOptions) {
  const repository = createPrismaEventRepository(options.db)
  const service = new EventService({
    admin: repository,
    connections: repository,
    deferDelete: (objectKey) => {
      options.backgroundTasks.defer(() => options.storage.deleteObject(objectKey))
    },
    hostess: repository,
    ideas: repository,
    leaderboard: repository,
    network: createPrismaNetworkReader(options.db),
    newPhotoKey: (now) => createStorageObjectKey({ namespace: 'planned-photos', now }),
    participants: repository,
    photoSources: repository,
    planned: repository,
    registration: repository,
    scanner: repository,
    stations: repository,
    storage: options.storage,
    teams: repository,
  })
  const routes = createEventRoutes({
    adminNetworkReadRateLimit: options.adminNetworkReadRateLimit,
    connectionRateLimit: options.connectionRateLimit,
    ideaRateLimit: options.ideaRateLimit,
    requireAdmin: options.requireAdmin,
    requireAuth: options.requireAuth,
    requireHostess: options.requireHostess,
    requireNetworkViewer: options.requireNetworkViewer,
    requireParticipant: options.requireParticipant,
    service,
  })
  return {
    ...routes,
    /** Signed photo links for any users (profile rule, short TTL), for lists of people in other features. */
    userPhotos: (userIds: string[]) => service.userPhotos(userIds),
  }
}
