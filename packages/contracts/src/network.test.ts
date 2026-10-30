import { describe, expect, test } from 'bun:test'

import { flaskResponseSchema, networkResponseSchema } from './network'

describe('network screen contract', () => {
  test('a node carries an id and initials and refuses any other personal field', () => {
    const edges = [{ a: 'a', b: 'b' }]
    expect(networkResponseSchema.safeParse({ nodes: [{ id: 'a', initials: 'ИК', photo: null }], edges }).success).toBe(true)
    expect(
      networkResponseSchema.safeParse({
        nodes: [{ id: 'a', initials: 'ИК', firstName: 'Иван' }],
        edges,
      }).success,
    ).toBe(false)
    const photo = { url: '/p', expiresAt: '2026-10-28T10:00:00.000Z' }
    expect(networkResponseSchema.safeParse({ nodes: [{ id: 'a', initials: 'ИК', photo }], edges }).success).toBe(true)
    expect(networkResponseSchema.safeParse({ nodes: [{ id: 'a', initials: 'ИК' }], edges }).success).toBe(false)
    expect(networkResponseSchema.safeParse({ nodes: [{ id: 'a', initials: '', photo: null }], edges }).success).toBe(false)
    expect(networkResponseSchema.safeParse({ nodes: [{ id: 'a', initials: 'ИВК', photo: null }], edges }).success).toBe(false)
  })
})

describe('flask screen contract', () => {
  test('an idea carries who and when, and refuses idea text or an email', () => {
    const participant = { fullName: 'Иван Кремнев', initials: 'ИК', photo: null }
    const idea = { id: 'i', createdAt: '2026-10-28T10:00:00.000Z', participant }
    const base = { serverNow: '2026-10-28T10:01:00.000Z', total: 1 }
    expect(flaskResponseSchema.safeParse({ ...base, ideas: [idea] }).success).toBe(true)
    expect(flaskResponseSchema.safeParse({ ...base, ideas: [{ ...idea, title: 'Секрет' }] }).success).toBe(false)
    expect(
      flaskResponseSchema.safeParse({ ...base, ideas: [{ ...idea, participant: { ...participant, email: 'a@b.c' } }] }).success,
    ).toBe(false)
  })
})
