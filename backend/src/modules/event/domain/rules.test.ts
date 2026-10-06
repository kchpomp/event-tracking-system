import { describe, expect, test } from 'bun:test'

import {
  connectionPoints,
  ideaPoints,
  orderedPair,
  participantFullName,
  sameCityAndCompany,
  searchWords,
} from './rules'

describe('event scoring rules', () => {
  test('only the first 5 ideas and the first 3 connections score', () => {
    expect([0, 4, 5, 9].map(ideaPoints)).toEqual([1, 1, 0, 0])
    expect([0, 2, 3, 8].map(connectionPoints)).toEqual([1, 1, 0, 0])
  })

  test('a pair is stored lowest id first whichever way it is given', () => {
    expect(orderedPair('b', 'a')).toEqual(['a', 'b'])
    expect(orderedPair('a', 'b')).toEqual(['a', 'b'])
  })

  test('staff see the full name, else the display name, else «Участник»', () => {
    const none = { firstName: null, lastName: null, displayName: null }
    expect(participantFullName({ ...none, firstName: 'Анна', lastName: 'Петрова' })).toBe('Анна Петрова')
    expect(participantFullName({ ...none, firstName: 'Анна' })).toBe('Анна')
    expect(participantFullName({ ...none, displayName: ' Ася ' })).toBe('Ася')
    expect(participantFullName(none)).toBe('Участник')
  })

  test('a staff search is split into at most five words', () => {
    expect(searchWords('  Анна   Петрова ')).toEqual(['Анна', 'Петрова'])
    expect(searchWords('a b c d e f g')).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(searchWords('   ')).toEqual([])
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
