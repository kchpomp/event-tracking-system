import { expect, test } from 'bun:test'
import { PLANNED_IMPORT_MAX, type PlannedParticipant } from '@event-tracking-system/contracts'

import {
  filterPlanned,
  hostessesWithoutRole,
  ofKind,
  parsePlannedLines,
  plannedLabel,
  plannedStatus,
  readyForHostessRole,
} from '../src/features/event/planned-model'

test('reads an address with a name in any order and separator', () => {
  const parsed = parsePlannedLines(
    [
      'anna@example.com',
      'Олег Иванов <oleg@example.com>',
      'maria@example.com; Мария Сидорова',
      'IVAN@Example.com,Иван Петров',
      'pavel@example.com\tПавел\tСмирнов',
      '',
      '   ',
    ].join('\n'),
  )

  expect(parsed.entries).toEqual([
    { email: 'anna@example.com' },
    { email: 'oleg@example.com', fullName: 'Олег Иванов' },
    { email: 'maria@example.com', fullName: 'Мария Сидорова' },
    { email: 'ivan@example.com', fullName: 'Иван Петров' },
    { email: 'pavel@example.com', fullName: 'Павел Смирнов' },
  ])
  expect(parsed.invalid).toEqual([])
  expect(parsed.truncated).toBe(false)
})

test('reports a line without an address instead of dropping it', () => {
  const parsed = parsePlannedLines('Анна Петрова\nanna@example.com\nolegexample.com')
  expect(parsed.entries).toEqual([{ email: 'anna@example.com' }])
  expect(parsed.invalid).toEqual(['Анна Петрова', 'olegexample.com'])
})

test('keeps no more than one import takes', () => {
  const text = Array.from({ length: PLANNED_IMPORT_MAX + 3 }, (_, index) => `p${index}@example.com`).join('\n')
  const parsed = parsePlannedLines(text)
  expect(parsed.entries).toHaveLength(PLANNED_IMPORT_MAX)
  expect(parsed.truncated).toBe(true)
})

test('filters by who has signed up and names people by name, else by address', () => {
  const person = (email: string, registered: boolean, fullName: string | null = null): PlannedParticipant => ({
    id: email,
    email,
    fullName,
    kind: 'participant',
    registered,
    registeredAt: registered ? '2026-10-10T10:00:00.000Z' : null,
    role: registered ? 'user' : null,
    userId: registered ? `user-${email}` : null,
    accountName: registered ? 'Аккаунт Имя' : null,
    nameMatches: registered ? true : null,
  })
  const items = [person('a@example.com', true, 'Анна'), person('b@example.com', false)]

  expect(filterPlanned(items, 'all')).toHaveLength(2)
  expect(filterPlanned(items, 'pending').map((item) => item.email)).toEqual(['b@example.com'])
  expect(filterPlanned(items, 'registered').map((item) => item.email)).toEqual(['a@example.com'])
  expect(plannedLabel(items[0]!)).toBe('Анна')
  expect(plannedLabel(items[1]!)).toBe('b@example.com')
})

test('a hostess is done only when she has the role, and a participant when there is an account', () => {
  const base = {
    id: 'x',
    email: 'x@example.com',
    fullName: null,
    registeredAt: null,
    userId: 'u',
    accountName: 'Ольга Хостесова',
    nameMatches: true,
  } as const
  const olga: PlannedParticipant = { ...base, kind: 'hostess', registered: true, role: 'hostess' }
  const vera: PlannedParticipant = { ...base, id: 'v', kind: 'hostess', registered: true, role: 'user' }
  const nina: PlannedParticipant = { ...base, id: 'n', kind: 'hostess', registered: false, role: null }
  const pavel: PlannedParticipant = { ...base, id: 'p', kind: 'participant', registered: true, role: 'user' }

  expect(plannedStatus(olga).done).toBe(true)
  expect(plannedStatus(vera)).toEqual({ done: false, text: 'Аккаунт есть, роль хостес не назначена' })
  expect(plannedStatus(nina).done).toBe(false)
  expect(plannedStatus(pavel).done).toBe(true)

  const all = [olga, vera, nina, pavel]
  expect(ofKind(all, 'hostess')).toHaveLength(3)
  expect(hostessesWithoutRole(all).map((item) => item.id)).toEqual(['v'])
})

test('the one-button role is offered only when the account name holds the listed name', () => {
  const base = { fullName: 'Ольга Хостесова', registeredAt: null, kind: 'hostess', registered: true } as const
  const matching: PlannedParticipant = {
    ...base, id: 'a', email: 'a@example.com', role: 'user', userId: 'ua', accountName: 'Ольга Хостесова', nameMatches: true,
  }
  const otherName: PlannedParticipant = {
    ...base, id: 'b', email: 'b@example.com', role: 'user', userId: 'ub', accountName: 'Анна Петрова', nameMatches: false,
  }
  const alreadyHostess: PlannedParticipant = { ...matching, id: 'c', role: 'hostess' }
  const notRegistered: PlannedParticipant = {
    ...base, id: 'd', email: 'd@example.com', registered: false, role: null, userId: null, accountName: null, nameMatches: null,
  }
  const items = [matching, otherName, alreadyHostess, notRegistered]

  expect(readyForHostessRole(items).map((item) => item.id)).toEqual(['a'])
  // The ones to check by hand are still reported, with the name of their account.
  expect(hostessesWithoutRole(items).map((item) => item.id)).toEqual(['a', 'b'])
})
