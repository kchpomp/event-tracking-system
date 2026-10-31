import { expect, test } from 'bun:test'

import {
  adminUsersPagination,
  deleteFailureReason,
  roleBlockedByUnverifiedEmail,
  roleChangeDeletesPoints,
  roleMutationFeedback,
} from '../src/features/admin/model'
import { ApiRequestError } from '../src/platform/api'

test('admin pagination respects the reachable server window', () => {
  expect(adminUsersPagination({
    hasNext: false,
    page: 100,
    pageSize: 20,
    total: 2_001,
  })).toEqual({
    canGoNext: false,
    reachableUsers: 2_000,
    totalPages: 100,
    wasBounded: true,
  })
})

test('a refused deletion is explained in Russian, anything else stays generic', () => {
  expect(deleteFailureReason(new ApiRequestError(404, 'NOT_FOUND', 'User not found'))).toContain('уже нет')
  expect(deleteFailureReason(new ApiRequestError(409, 'CONFLICT', 'You cannot delete your own account'))).toContain(
    'собственный',
  )
  expect(deleteFailureReason(new ApiRequestError(500, 'INTERNAL', 'raw'))).toBe(
    'Не удалось удалить пользователя. Попробуйте ещё раз.',
  )
  expect(deleteFailureReason(new TypeError('offline'))).toContain('Не удалось')
})

test('every role but participant deletes points on a role change', () => {
  expect(roleChangeDeletesPoints('user')).toBe(false)
  for (const role of ['hostess', 'admin', 'screen'] as const) expect(roleChangeDeletesPoints(role)).toBe(true)
})

test('staff roles are blocked for an unverified email, other roles are not', () => {
  const unverified = { emailVerified: false, role: 'user' as const }
  expect(roleBlockedByUnverifiedEmail(unverified, 'hostess')).toBe(true)
  expect(roleBlockedByUnverifiedEmail(unverified, 'admin')).toBe(true)
  expect(roleBlockedByUnverifiedEmail(unverified, 'screen')).toBe(false)
  expect(roleBlockedByUnverifiedEmail({ ...unverified, emailVerified: true }, 'admin')).toBe(false)
  // A role the person already holds stays selectable.
  expect(roleBlockedByUnverifiedEmail({ emailVerified: false, role: 'hostess' }, 'hostess')).toBe(false)
})

test('the server refusing an unverified email is explained, not echoed', () => {
  const feedback = roleMutationFeedback({
    data: undefined,
    error: new ApiRequestError(409, 'EMAIL_NOT_VERIFIED', 'raw english text'),
    isError: true,
    isSuccess: false,
  })
  expect(feedback?.kind === 'error' && feedback.reason).not.toContain('raw english text')
})
