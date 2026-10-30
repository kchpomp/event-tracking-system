import { expect, test } from 'bun:test'

import {
  badgeIssuedMessage,
  badgeJustIssued,
  badgeState,
  badgeStatusText,
  ballsWord,
  hostessBadgeDialog,
} from '../src/features/event/badge-model'
import { badgeErrorMessage } from '../src/features/event/errors'
import { ApiRequestError } from '../src/platform/api'

const status = (overrides: Partial<Parameters<typeof hostessBadgeDialog>[0]> = {}) => ({
  completed: 3,
  required: 3,
  eligible: true,
  issued: false,
  points: 1,
  participant: { id: 'p', fullName: 'Иван Петров' },
  ...overrides,
})

test('hostess dialog: issue, blocked and already issued', () => {
  expect(hostessBadgeDialog(status())).toMatchObject({
    kind: 'eligible',
    message: 'Участнику Иван Петров можно выдать значок. Он получит ещё 1 балл.',
  })
  expect(hostessBadgeDialog(status({ eligible: false, completed: 2 }))).toMatchObject({
    kind: 'locked',
    message: 'Значок пока выдать нельзя: пройдено 2 из 3 активностей.',
  })
  expect(hostessBadgeDialog(status({ issued: true })).kind).toBe('issued')
})

test('issued wins over eligible', () => {
  expect(badgeState({ eligible: true, issued: true })).toBe('issued')
})

test('plural and success text', () => {
  expect([1, 2, 5].map(ballsWord)).toEqual(['1 балл', '2 балла', '5 баллов'])
  expect(badgeIssuedMessage(1)).toBe('Значок выдан, участник получил 1 балл')
})

test('only a false to true flip counts as just issued', () => {
  expect(badgeJustIssued(false, true)).toBe(true)
  expect(badgeJustIssued(undefined, true)).toBe(false)
  expect(badgeJustIssued(true, true)).toBe(false)
  expect(badgeJustIssued(false, false)).toBe(false)
})

test('participant status text', () => {
  expect(badgeStatusText({ completed: 1, required: 3, eligible: false, issued: false })).toContain('ещё 2 из 3')
  expect(badgeStatusText({ completed: 3, required: 3, eligible: true, issued: false })).toContain('Можно получить')
  expect(badgeStatusText({ completed: 3, required: 3, eligible: true, issued: true })).toBe('Значок получен')
})

test('badge 409 messages come from the server, other errors stay friendly', () => {
  expect(badgeErrorMessage(new ApiRequestError(409, 'BADGE_ALREADY_ISSUED', 'Значок уже выдан.'))).toBe('Значок уже выдан.')
  expect(badgeErrorMessage(new ApiRequestError(409, 'EVENT_NOT_ACTIVE', 'raw'))).toBe('Мероприятие сейчас не проходит.')
})
