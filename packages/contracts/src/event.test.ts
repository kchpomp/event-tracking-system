import { describe, expect, test } from 'bun:test'

import { userRoleSchema } from './auth'
import {
  hostessAwardRequestSchema,
  updateTeamScheduleRequestSchema,
  hostessTeamAwardRequestSchema,
  importPlannedRequestSchema,
  hostessResolveRequestSchema,
  hostessSearchQuerySchema,
} from './event'

describe('hostess contracts', () => {
  test('the hostess role can be assigned, an unknown role cannot', () => {
    expect(userRoleSchema.parse('hostess')).toBe('hostess')
    expect(userRoleSchema.safeParse('moderator').success).toBe(false)
  })

  test('a search needs two characters after trimming', () => {
    expect(hostessSearchQuerySchema.parse({ q: '  Анна ' })).toEqual({ q: 'Анна' })
    expect(hostessSearchQuerySchema.safeParse({ q: ' а ' }).success).toBe(false)
    expect(hostessSearchQuerySchema.safeParse({ q: 'x'.repeat(101) }).success).toBe(false)
  })

  test('an award names the participant and the station by id and carries no points', () => {
    const id = crypto.randomUUID()
    expect(hostessAwardRequestSchema.safeParse({ participantId: id, stationId: id }).success).toBe(true)
    expect(hostessAwardRequestSchema.safeParse({ participantId: 'x', stationId: id }).success).toBe(false)
    // The amount always comes from the station: a hostess cannot choose it.
    expect(
      hostessAwardRequestSchema.safeParse({ participantId: id, stationId: id, points: 99 }).success,
    ).toBe(false)
  })

  test('a scanned participant token must not be empty', () => {
    expect(hostessResolveRequestSchema.safeParse({ token: ' abc ' }).success).toBe(true)
    expect(hostessResolveRequestSchema.safeParse({ token: '  ' }).success).toBe(false)
  })
})

describe('team award and planned list contracts', () => {
  const key = crypto.randomUUID()

  test('a team award is 1..50 whole points with a key', () => {
    const base = { teamId: crypto.randomUUID(), awardKey: key }
    for (const points of [1, 50]) {
      expect(hostessTeamAwardRequestSchema.safeParse({ ...base, points }).success).toBe(true)
    }
    for (const points of [0, 51, 1.5, -3]) {
      expect(hostessTeamAwardRequestSchema.safeParse({ ...base, points }).success).toBe(false)
    }
    expect(hostessTeamAwardRequestSchema.safeParse({ ...base, points: 5, awardKey: 'x' }).success).toBe(false)
  })

  test('a planned entry has exactly the five columns, each named in its error', () => {
    const entry = { email: ' A@B.ru ', firstName: 'Анна', lastName: 'Петрова', department: 'СИБУР', city: 'Москва' }
    const ok = importPlannedRequestSchema.parse({ kind: 'participant', entries: [entry] })
    expect(ok.entries[0]!.email).toBe('a@b.ru')

    const bad = (patch: object) =>
      importPlannedRequestSchema.safeParse({ kind: 'participant', entries: [{ ...entry, ...patch }] })
    expect(bad({ city: '  ' }).error?.issues[0]?.message).toContain('город')
    expect(bad({ email: 'nope' }).error?.issues[0]?.message).toContain('email')
    expect(bad({ firstName: undefined }).error?.issues[0]?.message).toContain('имя')
    expect(bad({ fullName: 'x' }).success).toBe(false)
  })
})

describe('team schedule request', () => {
  const t = (minutes: number) => new Date(Date.UTC(2030, 0, 1, 12, minutes)).toISOString()
  test.each([
    [{ startsAt: t(0), endsAt: t(15) }, true],
    [{ startsAt: null, endsAt: null }, true],
    [{ startsAt: t(0), endsAt: null }, false],
    [{ startsAt: null, endsAt: t(15) }, false],
    [{ startsAt: t(15), endsAt: t(15) }, false],
    [{ startsAt: t(15), endsAt: t(0) }, false],
    [{ startsAt: 'soon', endsAt: t(0) }, false],
  ])('%j -> %p', (body, ok) => {
    expect(updateTeamScheduleRequestSchema.safeParse(body).success).toBe(ok)
  })
})
