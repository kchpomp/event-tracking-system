import { expect, test } from 'bun:test'
import type { StationSummary } from '@event-tracking-system/contracts'

import { eventErrorMessage, GENERIC_ERROR, OFFLINE_ERROR } from '../src/features/event/errors'
import {
  activityProgress,
  fullName,
  hasOwnScanButton,
  pointsLabel,
  pointsWord,
  toStationCards,
  tokenFrom,
} from '../src/features/event/model'
import { ApiRequestError } from '../src/platform/api'

const station = (overrides: Partial<StationSummary>): StationSummary => ({
  id: 'id',
  name: 'Станция',
  points: 1,
  displayGroup: null,
  visited: false,
  ...overrides,
})

test('stations sharing a display group are one card, done when any of them is visited', () => {
  const cards = toStationCards([
    station({ id: 'a', name: 'Воркшоп 1' }),
    station({ id: 'p1', name: 'Полимер решений', points: 10, displayGroup: 'polymer_solutions' }),
    station({ id: 'p2', name: 'Полимер решений', points: 9, displayGroup: 'polymer_solutions', visited: true }),
  ])
  expect(cards).toHaveLength(2)
  expect(cards[1]).toMatchObject({ id: 'p1', points: [10, 9], done: true })
  expect(pointsLabel(cards[0]!.points)).toBe('1')
  expect(pointsLabel(cards[1]!.points)).toBe('до 10')
})

test('points are counted with the Russian plural, including the teens and 21', () => {
  expect([0, 1, 2, 4, 5, 10, 11, 12, 14, 21, 22, 25, 101, 111].map(pointsWord)).toEqual([
    '0 очков',
    '1 очко',
    '2 очка',
    '4 очка',
    '5 очков',
    '10 очков',
    '11 очков',
    '12 очков',
    '14 очков',
    '21 очко',
    '22 очка',
    '25 очков',
    '101 очко',
    '111 очков',
  ])
})

test('progress counts cards plus the two activities, and both counters stop at their goal', () => {
  const cards = [{ done: true }, { done: false }, { done: false }]
  expect(activityProgress(cards, 0, 0)).toMatchObject({ doneActivities: 1, totalActivities: 5, percent: 20, step: 1 })
  // 9 ideas and 7 connections count as 5 and 3: both activities are done.
  expect(activityProgress(cards, 9, 7)).toMatchObject({
    ideas: 5,
    links: 3,
    doneActivities: 3,
    percent: 60,
    step: 3,
  })
  expect(activityProgress([{ done: true }], 5, 3)).toMatchObject({ percent: 100, step: 4 })
  expect(activityProgress([], 0, 0)).toMatchObject({ doneActivities: 0, totalActivities: 2, percent: 0, step: 0 })
})

test('a scanned QR yields the token whether it is a URL or the bare token', () => {
  expect(tokenFrom('  abc-123\r\n')).toBe('abc-123')
  expect(tokenFrom('https://example.com/s/abc-123')).toBe('abc-123')
  // A URL with no path has no token in it: the text is used as it is.
  expect(tokenFrom('https://example.com/')).toBe('https://example.com/')
})

test('names fall back to «Участник» and station pages know their own scan button', () => {
  expect(fullName({ firstName: 'Анна', lastName: 'Петрова' })).toBe('Анна Петрова')
  expect(fullName({ firstName: null, lastName: null })).toBe('Участник')
  expect(hasOwnScanButton('Точка соединения')).toBe(false)
  expect(hasOwnScanButton('Воркшоп 2')).toBe(false)
  expect(hasOwnScanButton('Новая станция')).toBe(true)
})

test('every backend refusal has its own sentence and nothing raw reaches the user', () => {
  const refusal = (code: string, status = 409) => new ApiRequestError(status, code, 'raw english text')
  expect(eventErrorMessage(refusal('DIFFUSION_SELF'))).toBe('Нельзя создать связь с самим собой.')
  expect(eventErrorMessage(refusal('EVENT_NOT_ACTIVE'))).toBe('Мероприятие сейчас не проходит.')
  expect(eventErrorMessage(refusal('INTERNAL_ERROR', 500))).toBe(GENERIC_ERROR)
  expect(eventErrorMessage(refusal('SOMETHING_NEW', 429))).toContain('Слишком много попыток')
  expect(eventErrorMessage(new TypeError('Failed to fetch'))).toBe(OFFLINE_ERROR)
  expect(eventErrorMessage(new Error('raw'))).toBe(GENERIC_ERROR)
  expect(eventErrorMessage(refusal('DIFFUSION_SELF'))).not.toContain('raw english text')
})
