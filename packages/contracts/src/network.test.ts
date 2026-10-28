import { describe, expect, test } from 'bun:test'

import { networkResponseSchema } from './network'

describe('network screen contract', () => {
  test('a node carries an id and initials and refuses any other personal field', () => {
    const edges = [{ a: 'a', b: 'b' }]
    expect(networkResponseSchema.safeParse({ nodes: [{ id: 'a', initials: 'ИК' }], edges }).success).toBe(true)
    expect(
      networkResponseSchema.safeParse({
        nodes: [{ id: 'a', initials: 'ИК', firstName: 'Иван' }],
        edges,
      }).success,
    ).toBe(false)
    expect(networkResponseSchema.safeParse({ nodes: [{ id: 'a', initials: '' }], edges }).success).toBe(false)
    expect(networkResponseSchema.safeParse({ nodes: [{ id: 'a', initials: 'ИВК' }], edges }).success).toBe(false)
  })
})
