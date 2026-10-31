import type {
  AdminUsersQuery,
  UpdateProfileRequest,
  UpdateUserRoleRequest,
  UserDto,
} from '@event-tracking-system/contracts'

import type { AuthenticatedPrincipal } from '../../auth'
import type {
  AdminDashboardReader,
  AdminUsersReader,
  Clock,
  EmailVerificationRequester,
  ProfileWriter,
  UserDeleter,
  UserRecord,
  UserRoleUpdater,
} from './ports'

type UsersServiceDependencies = {
  adminDashboardReader: AdminDashboardReader
  adminUsersReader: AdminUsersReader
  clock: Clock
  /** Removes a stored photo after the response: a storage hiccup must not undo a committed deletion. */
  deferDelete: (objectKey: string) => void
  emailVerificationRequester: EmailVerificationRequester
  profileWriter: ProfileWriter
  userDeleter: UserDeleter
  userRoleUpdater: UserRoleUpdater
}

export class UsersService {
  constructor(private readonly dependencies: UsersServiceDependencies) {}

  async updateProfile(principal: AuthenticatedPrincipal, input: UpdateProfileRequest) {
    const user = await this.dependencies.profileWriter.updateProfile(
      principal.id,
      input.displayName,
    )
    return {
      user: this.userDto(user),
    }
  }

  dashboard() {
    return this.dependencies.adminDashboardReader.dashboard()
  }

  listUsers(query: AdminUsersQuery) {
    return this.dependencies.adminUsersReader.listUsers(query)
  }

  async updateRole(
    principal: AuthenticatedPrincipal,
    targetUserId: string,
    input: UpdateUserRoleRequest,
  ) {
    return {
      user: await this.dependencies.userRoleUpdater.updateRole({
        actorUserId: principal.id,
        targetUserId,
        role: input.role,
        now: this.dependencies.clock.now(),
      }),
    }
  }

  /** An administrator asks for the confirmation email of an account about to get a staff role. */
  async requestEmailVerification(targetUserId: string) {
    await this.dependencies.emailVerificationRequester.requestEmailVerification({
      targetUserId,
      now: this.dependencies.clock.now(),
    })
    return { accepted: true as const }
  }

  async deleteUser(principal: AuthenticatedPrincipal, targetUserId: string) {
    const { avatarKeys } = await this.dependencies.userDeleter.deleteUser({
      actorUserId: principal.id,
      targetUserId,
    })
    for (const objectKey of avatarKeys) this.dependencies.deferDelete(objectKey)
    return { deleted: true as const }
  }

  private userDto(user: UserRecord): UserDto {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      emailVerified: user.emailVerifiedAt !== null,
      createdAt: user.createdAt.toISOString(),
    }
  }
}
