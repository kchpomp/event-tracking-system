import { describe, expect, test } from 'bun:test'

import {
  completedActivities,
  connectionPoints,
  ideaPoints,
  listedNameMatches,
  orderedPair,
  participantFullName,
  participantInitials,
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

  test('the network screen shows the first letters of the first and the last name', () => {
    const none = { firstName: null, lastName: null, displayName: null }
    // Кремнев Иван Владимирович → «ИК»: first name first, capitals, spaces trimmed.
    expect(participantInitials({ ...none, firstName: ' иван ', lastName: 'кремнев' })).toBe('ИК')
    expect(participantInitials({ ...none, firstName: 'ёлка', lastName: 'Ёжикова' })).toBe('ЁЁ')
    // A double surname gives one letter, its first.
    expect(participantInitials({ ...none, firstName: 'Анна', lastName: 'Римская-Корсакова' })).toBe('АР')
    expect(participantInitials({ ...none, firstName: 'Анна', lastName: 'Римская Корсакова' })).toBe('АР')
    // Punctuation before a name is not a letter.
    expect(participantInitials({ ...none, firstName: '«Анна»', lastName: '-Петрова' })).toBe('АП')
  })

  test('without both names the initials come from what there is, else a neutral symbol', () => {
    const none = { firstName: null, lastName: null, displayName: null }
    expect(participantInitials({ ...none, displayName: 'olivia nguyen' })).toBe('ON')
    expect(participantInitials({ ...none, firstName: 'Анна', displayName: 'Анна Петрова' })).toBe('АП')
    expect(participantInitials({ ...none, lastName: 'Петрова', displayName: '  ' })).toBe('П')
    expect(participantInitials({ ...none, firstName: '   ', displayName: 'Ася' })).toBe('А')
    expect(participantInitials({ ...none, firstName: '', lastName: '' })).toBe('•')
    expect(participantInitials({ ...none, displayName: '123 !!' })).toBe('•')
    expect(participantInitials(none)).toBe('•')
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

describe('badge activities', () => {
  test('stations count one each, Polymer, connections and ideas once; other rows do not count', () => {
    const rows = [
      { actionType: 'station_scan', refId: 'a' },
      { actionType: 'station_scan', refId: 'b' },
      { actionType: 'polymer', refId: 'p1' },
      { actionType: 'connection', refId: 'c1' },
      { actionType: 'connection', refId: 'c2' },
      { actionType: 'idea', refId: 'i1' },
      { actionType: 'idea', refId: 'i2' },
      { actionType: 'team_bonus', refId: 'k' },
      { actionType: 'badge', refId: 'e' },
    ]
    expect(completedActivities(rows)).toHaveLength(5)
    expect(completedActivities(rows.slice(2, 3))).toHaveLength(1)
    expect(completedActivities([])).toHaveLength(0)
  })
})
