import type { MiddlewareHandler } from 'hono'

import type { TaskDeferrer } from '../../background-tasks'
import type { DbClient } from '../../db'
import type { PrivateStorage } from '../../storage'
import type { AuthHttpEnv } from '../auth'
import { UsersService } from './application/users-service'
import { createPrismaUsersRepository } from './infrastructure/users-repository'
import { createUsersRoutes } from './transport/routes'

type CreateUsersModuleOptions = {
  adminUsersReadRateLimit: MiddlewareHandler<AuthHttpEnv>
  backgroundTasks: TaskDeferrer
  db: DbClient
  requireAdmin: MiddlewareHandler<AuthHttpEnv>
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  storage: PrivateStorage
}

export function createUsersModule(options: CreateUsersModuleOptions) {
  const repository = createPrismaUsersRepository(options.db)
  const service = new UsersService({
    adminDashboardReader: repository,
    adminUsersReader: repository,
    clock: { now: () => new Date() },
    // After the response, like a replaced avatar: an orphaned file is harmless, a failed deletion is not.
    deferDelete: (objectKey) => {
      options.backgroundTasks.defer(() => options.storage.deleteObject(objectKey))
    },
    emailVerificationRequester: repository,
    profileWriter: repository,
    userDeleter: repository,
    userRoleUpdater: repository,
  })
  return createUsersRoutes({
    adminUsersReadRateLimit: options.adminUsersReadRateLimit,
    requireAdmin: options.requireAdmin,
    requireAuth: options.requireAuth,
    service,
  })
}
