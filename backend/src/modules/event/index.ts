import type { MiddlewareHandler } from 'hono'

import type { DbClient } from '../../db'
import type { AuthHttpEnv } from '../auth'
import { EventService } from './application/event-service'
import { createPrismaEventRepository } from './infrastructure/event-repository'
import { createEventRoutes } from './transport/routes'

type CreateEventModuleOptions = {
  db: DbClient
  requireAdmin: MiddlewareHandler<AuthHttpEnv>
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  requireHostess: MiddlewareHandler<AuthHttpEnv>
  requireParticipant: MiddlewareHandler<AuthHttpEnv>
}

export function createEventModule(options: CreateEventModuleOptions) {
  const repository = createPrismaEventRepository(options.db)
  const service = new EventService({
    admin: repository,
    connections: repository,
    hostess: repository,
    ideas: repository,
    leaderboard: repository,
    participants: repository,
    planned: repository,
    registration: repository,
    scanner: repository,
    stations: repository,
  })
  return createEventRoutes({
    requireAdmin: options.requireAdmin,
    requireAuth: options.requireAuth,
    requireHostess: options.requireHostess,
    requireParticipant: options.requireParticipant,
    service,
  })
}
