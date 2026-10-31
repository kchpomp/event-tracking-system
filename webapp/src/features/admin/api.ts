import {
  adminDashboardResponseSchema,
  adminUsersQuerySchema,
  adminUsersResponseSchema,
  deleteUserResponseSchema,
  emailVerificationRequestResponseSchema,
  updateUserRoleRequestSchema,
  updateUserRoleResponseSchema,
  type AdminUsersQuery,
  type UpdateUserRoleRequest,
} from '@event-tracking-system/contracts'

import type { AuthenticatedTransport } from '@/platform/api'

export function getAdminDashboard(
  transport: AuthenticatedTransport,
  options: { signal?: AbortSignal } = {},
) {
  return transport.request('/api/admin/dashboard', adminDashboardResponseSchema, options)
}

export function getAdminUsers(
  transport: AuthenticatedTransport,
  input: AdminUsersQuery,
  options: { signal?: AbortSignal } = {},
) {
  const query = adminUsersQuerySchema.parse(input)
  const search = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  })
  if (query.q) search.set('q', query.q)
  return transport.request(`/api/admin/users?${search}`, adminUsersResponseSchema, options)
}

/** Queues the confirmation email for an account that is about to get the hostess or admin role. */
export function requestAdminUserEmailVerification(transport: AuthenticatedTransport, userId: string) {
  return transport.request(
    `/api/admin/users/${encodeURIComponent(userId)}/email-verification`,
    emailVerificationRequestResponseSchema,
    { method: 'POST' },
  )
}

export function deleteAdminUser(transport: AuthenticatedTransport, userId: string) {
  return transport.request(`/api/admin/users/${encodeURIComponent(userId)}`, deleteUserResponseSchema, {
    method: 'DELETE',
  })
}

export function updateAdminUserRole(
  transport: AuthenticatedTransport,
  userId: string,
  input: UpdateUserRoleRequest,
) {
  return transport.request(
    `/api/admin/users/${encodeURIComponent(userId)}/role`,
    updateUserRoleResponseSchema,
    {
      method: 'PATCH',
      body: updateUserRoleRequestSchema.parse(input),
    },
  )
}
