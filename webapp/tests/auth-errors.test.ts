import { expect, test } from 'bun:test'

import { authErrorMessage } from '../src/features/auth/auth-errors'
import { ApiRequestError } from '../src/platform/api'

const refusal = (status: number, code = 'UNAUTHORIZED') => new ApiRequestError(status, code, 'raw english text')

test('a wrong password and a taken email each get their own sentence', () => {
  expect(authErrorMessage(refusal(401), 'login')).toBe('Неверный email или пароль.')
  expect(authErrorMessage(refusal(409, 'CONFLICT'), 'register')).toBe(
    'Пользователь с таким email уже зарегистрирован.',
  )
  expect(authErrorMessage(refusal(400, 'AUTH_PASSWORD_RESET_INVALID'), 'reset-confirm')).toContain(
    'недействительна',
  )
})

test('limits, outages and anything unknown never show the server text', () => {
  expect(authErrorMessage(refusal(429, 'RATE_LIMITED'), 'login')).toContain('Слишком много попыток')
  expect(authErrorMessage(new TypeError('Failed to fetch'), 'register')).toContain('Нет связи')
  for (const action of ['login', 'register', 'reset-request', 'reset-confirm'] as const) {
    expect(authErrorMessage(refusal(500, 'INTERNAL_ERROR'), action)).toBe(
      'Что-то пошло не так. Попробуйте ещё раз.',
    )
    expect(authErrorMessage(new Error('raw'), action)).not.toContain('raw')
  }
  // A 401 only means "wrong password" while logging in.
  expect(authErrorMessage(refusal(401), 'register')).not.toContain('Неверный')
})
