import {
  ADMIN_USERS_MAX_PAGE,
  roleRequiresVerifiedEmail,
  type AdminUserSummary,
  type UpdateUserRoleResponse,
  type UserRole,
} from '@event-tracking-system/contracts'

import { ApiRequestError } from '@/platform/api'

const ROLE_LABELS: Record<UserRole, string> = {
  user: 'участник',
  admin: 'администратор',
  hostess: 'хостес',
  screen: 'экран',
}

/** The role in a sentence: «теперь хостес», «новая роль администратор». */
export function roleLabel(role: UserRole) {
  return ROLE_LABELS[role]
}

/** Any role but «участник» wipes the person's points and station visits on the server. */
export function roleChangeDeletesPoints(role: UserRole) {
  return role !== 'user'
}

/** Mirrors the server: hostess and admin go only to a verified email (409 EMAIL_NOT_VERIFIED). */
export function roleBlockedByUnverifiedEmail(
  user: Pick<AdminUserSummary, 'emailVerified' | 'role'>,
  role: UserRole,
) {
  return role !== user.role && !user.emailVerified && roleRequiresVerifiedEmail(role)
}

type AdminUsersQueryState = {
  isError: boolean
  isPending: boolean
  itemCount?: number
}

export function adminUsersViewState({
  isError,
  isPending,
  itemCount,
}: AdminUsersQueryState): 'loading' | 'error' | 'empty' | 'ready' {
  if (isPending) return 'loading'
  if (isError) return 'error'
  return itemCount === 0 ? 'empty' : 'ready'
}

export function adminUsersPagination({
  hasNext,
  page,
  pageSize,
  total,
}: {
  hasNext: boolean
  page: number
  pageSize: number
  total: number
}) {
  const unboundedPages = Math.max(1, Math.ceil(total / pageSize))
  const totalPages = Math.min(ADMIN_USERS_MAX_PAGE, unboundedPages)
  return {
    canGoNext: hasNext && page < totalPages,
    reachableUsers: Math.min(total, ADMIN_USERS_MAX_PAGE * pageSize),
    totalPages,
    wasBounded: unboundedPages > ADMIN_USERS_MAX_PAGE,
  }
}

export type RoleMutationFeedback =
  | { kind: 'error'; reason: string }
  | { kind: 'success'; user: AdminUserSummary }
  | null

/**
 * Everything the directory shows about the last role change comes from here. The error branch
 * carries the mutation error's message as the reason: for the backend's policy answers (last
 * administrator, self-demotion) that is the sentence the person needs, and the dialog renders it
 * under its heading instead of reaching into the raw mutation error. Network and response-shape
 * failures surface their own message the same way, as every other alert in this feature does.
 */
export function roleMutationFeedback({
  data,
  error,
  isError,
  isSuccess,
}: {
  data: UpdateUserRoleResponse | undefined
  error: Error | null
  isError: boolean
  isSuccess: boolean
}): RoleMutationFeedback {
  if (isError && error) {
    return {
      kind: 'error',
      reason: error instanceof ApiRequestError && error.code === 'EMAIL_NOT_VERIFIED'
        ? 'Пользователь ещё не подтвердил почту. Попросите его нажать «Подтвердить почту» в профиле.'
        : error.message,
    }
  }
  if (isSuccess && data) return { kind: 'success', user: data.user }
  return null
}
