import type {
  AdminUserSummary,
  AdminUsersQuery,
  UserRole,
} from '@event-tracking-system/contracts'
import { ADMIN_USERS_MAX_PAGE } from '@event-tracking-system/contracts'

import {
  acquireParticipantScoringLock,
  acquirePushTokenUserLock,
  acquireUserAuthenticationAuthorityLock,
  acquireUserRoleMutationLock,
  type DbClient,
  userAuthorityTransitionTransactionOptions,
} from '../../../db'
import type {
  AdminDashboardReader,
  AdminUsersReader,
  ProfileWriter,
  UserRoleUpdater,
} from '../application/ports'
import { UsersFailure } from '../domain/errors'

const userSummarySelect = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  createdAt: true,
} as const

type UsersRepository =
  & ProfileWriter
  & AdminDashboardReader
  & AdminUsersReader
  & UserRoleUpdater

export function createPrismaUsersRepository(db: DbClient): UsersRepository {
  return {
    updateProfile(userId, displayName) {
      return db.user.update({
        where: { id: userId },
        data: { displayName },
        select: userSummarySelect,
      })
    },

    async dashboard() {
      const [totalUsers, totalAdmins] = await db.$transaction([
        db.user.count(),
        db.user.count({ where: { role: 'admin' } }),
      ])
      return { totalUsers, totalAdmins }
    },

    async listUsers({ page, pageSize, q }: AdminUsersQuery) {
      const where = q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' as const } },
              { displayName: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}
      const [total, users] = await db.$transaction([
        db.user.count({ where }),
        db.user.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: userSummarySelect,
        }),
      ])
      return {
        items: users.map(toAdminUserSummary),
        page,
        pageSize,
        total,
        hasNext: page < ADMIN_USERS_MAX_PAGE && page * pageSize < total,
      }
    },

    updateRole(input) {
      return db.$transaction(async (tx) => {
        await acquirePushTokenUserLock(tx, input.targetUserId)
        await acquireUserRoleMutationLock(tx)
        await acquireUserAuthenticationAuthorityLock(tx, input.targetUserId)

        const actor = await tx.user.findUnique({
          where: { id: input.actorUserId },
          select: { id: true, role: true },
        })
        if (actor?.role !== 'admin') {
          throw new UsersFailure('forbidden', 'Administrator access is required')
        }

        const target = await tx.user.findUnique({
          where: { id: input.targetUserId },
          select: userSummarySelect,
        })
        if (!target) {
          throw new UsersFailure('not_found', 'User not found')
        }
        if (target.role === input.role) {
          return toAdminUserSummary(target)
        }
        if (target.id === actor.id && input.role !== 'admin') {
          throw new UsersFailure('role_conflict', 'You cannot remove your own administrator role')
        }

        if (target.role === 'admin' && input.role !== 'admin') {
          const adminCount = await tx.user.count({ where: { role: 'admin' } })
          if (adminCount <= 1) {
            throw new UsersFailure('role_conflict', 'At least one administrator must remain')
          }
        }

        const updated = await tx.user.update({
          where: { id: target.id },
          data: { role: input.role },
          select: userSummarySelect,
        })
        if (input.role === 'hostess') {
          // Staff do not play. They are already left out of the ranking by role; their points and
          // visit marks are removed too, so no total of theirs can be mistaken for a participant's
          // when winners are picked. Taken under the participant's scoring lock, so a scan in flight
          // either lands before this or finds a staff account. Ideas and connections stay: other
          // people's progress and the ideas bank are built on them.
          await acquireParticipantScoringLock(tx, target.id)
          await tx.activityLog.deleteMany({ where: { participantId: target.id } })
          await tx.stationVisit.deleteMany({ where: { participantId: target.id } })
        }
        await tx.authSession.updateMany({
          where: { userId: target.id, revokedAt: null },
          data: { revokedAt: input.now },
        })
        await tx.pushToken.deleteMany({
          where: { userId: target.id },
        })
        await tx.passwordResetToken.updateMany({
          where: { userId: target.id, usedAt: null },
          data: { usedAt: input.now },
        })
        return toAdminUserSummary(updated)
      }, userAuthorityTransitionTransactionOptions)
    },
  }
}

function toAdminUserSummary(user: {
  id: string
  email: string
  displayName: string | null
  role: UserRole
  createdAt: Date
}): AdminUserSummary {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  }
}
