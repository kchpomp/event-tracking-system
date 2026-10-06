import { describe, expect, test } from 'bun:test'

import { userRoleSchema } from './auth'
import {
  hostessAwardRequestSchema,
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
