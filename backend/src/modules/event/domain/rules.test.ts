import { describe, expect, test } from 'bun:test'

import {
  connectionPoints,
  ideaPoints,
  listedNameMatches,
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
    const me = { cityId: 'city-1', companyId: 'company-1' }
    expect(sameCityAndCompany(me, { cityId: 'city-1', companyId: 'company-1' })).toBe(true)
    expect(sameCityAndCompany(me, { cityId: 'city-1', companyId: 'company-2' })).toBe(false)
    expect(sameCityAndCompany(me, { cityId: 'city-2', companyId: 'company-1' })).toBe(false)
    // An unknown value never blocks.
    expect(sameCityAndCompany(me, { cityId: null, companyId: 'company-1' })).toBe(false)
    expect(sameCityAndCompany({ cityId: null, companyId: null }, { cityId: null, companyId: null })).toBe(false)
  })

  test('a listed name matches the account when it holds both the first and the last name', () => {
    const anna = { firstName: 'Анна', lastName: 'Петрова' }
    for (const listed of ['Анна Петрова', 'петрова анна', ' АННА  ПЕТРОВА ', 'Петрова Анна Ивановна', 'Петрова А. Анна']) {
      expect(listedNameMatches(listed, anna), listed).toBe(true)
    }
    expect(listedNameMatches('Алёна Ёлкина', { firstName: 'Алена', lastName: 'Елкина' })).toBe(true)

    // One of the two is not enough, and neither is nothing.
    for (const listed of ['Анна', 'Петрова', 'Анна Петрович', 'Ольга Хостесова', '', null]) {
      expect(listedNameMatches(listed, anna), String(listed)).toBe(false)
    }
    expect(listedNameMatches('Анна Петрова', { firstName: null, lastName: null })).toBe(false)
  })
})
