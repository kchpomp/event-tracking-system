import { describe, expect, test } from 'bun:test'

import { connectionPoints, ideaPoints, orderedPair, sameCityAndCompany } from './rules'

describe('event scoring rules', () => {
  test('only the first 5 ideas and the first 3 connections score', () => {
    expect([0, 4, 5, 9].map(ideaPoints)).toEqual([1, 1, 0, 0])
    expect([0, 2, 3, 8].map(connectionPoints)).toEqual([1, 1, 0, 0])
  })

  test('a pair is stored lowest id first whichever way it is given', () => {
    expect(orderedPair('b', 'a')).toEqual(['a', 'b'])
    expect(orderedPair('a', 'b')).toEqual(['a', 'b'])
  })

  test('the same city AND company blocks a connection, anything else does not', () => {
    const me = { city: 'Тюмень', company: 'Завод' }
    expect(sameCityAndCompany(me, { city: ' тюмень ', company: 'ЗАВОД' })).toBe(true)
    expect(sameCityAndCompany(me, { city: 'Тюмень', company: 'Офис' })).toBe(false)
    expect(sameCityAndCompany(me, { city: 'Омск', company: 'Завод' })).toBe(false)
    // An unknown value never blocks.
    expect(sameCityAndCompany(me, { city: null, company: 'Завод' })).toBe(false)
    expect(sameCityAndCompany({ city: null, company: null }, { city: null, company: null })).toBe(false)
  })
})
