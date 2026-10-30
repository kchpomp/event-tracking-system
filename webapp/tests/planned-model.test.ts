import { expect, test } from 'bun:test'
import { PLANNED_IMPORT_MAX, type PlannedParticipant } from '@event-tracking-system/contracts'

import {
  filterPlanned,
  hostessesWithoutRole,
  ofKind,
  parsePlannedTable,
  plannedLabel,
  plannedStatus,
  readyForHostessRole,
} from '../src/features/event/planned-model'

const HEADER = ['почта', 'имя', 'фамилия', 'подразделение', 'город']

test('reads the five columns in any order, with Russian or English address header', () => {
  const parsed = parsePlannedTable([
    HEADER,
    ['', '', '', '', ''],
    ['Anna@Example.com ', ' Анна', 'Петрова', 'Цех 1', 'Тюмень'],
  ])
  expect(parsed.error).toBeNull()
  expect(parsed.entries).toEqual([
    { email: 'anna@example.com', firstName: 'Анна', lastName: 'Петрова', department: 'Цех 1', city: 'Тюмень' },
  ])

  const shuffled = parsePlannedTable([
    ['Город', 'Фамилия', 'E-mail', 'Имя', 'Подразделение', '', ''],
    ['Омск', 'Иванов', 'oleg@example.com', 'Олег', 'ИТ'],
  ])
  expect(shuffled.error).toBeNull()
  expect(shuffled.entries[0]).toEqual({
    email: 'oleg@example.com', firstName: 'Олег', lastName: 'Иванов', department: 'ИТ', city: 'Омск',
  })
})

test('refuses a file with a missing, unknown or repeated column, naming it', () => {
  expect(parsePlannedTable([HEADER.slice(0, 4), ['a@example.com', 'А', 'Б', 'В']]).error).toContain('«город»')
  expect(parsePlannedTable([[...HEADER, 'телефон']]).error).toContain('Лишняя колонка «телефон»')
  expect(parsePlannedTable([[...HEADER.slice(0, 4), 'имя']]).error).toContain('«имя» повторяется')
  expect(parsePlannedTable([['почта', '', 'имя', 'фамилия', 'подразделение', 'город']]).error).toContain('без названия')
  // An old file without a header row is a missing-column file, not a silent import.
  expect(parsePlannedTable([['a@example.com', 'Анна']]).error).toContain('Лишняя колонка')
})

test('refuses an empty cell, a bad address or an extra cell with the row number', () => {
  const ok = ['a@example.com', 'Анна', 'Петрова', 'Цех', 'Тюмень']
  expect(parsePlannedTable([HEADER, ok, ['b@example.com', 'Олег', '', 'Цех', 'Омск']]).error).toBe(
    'Строка 3: пусто в колонке «фамилия».',
  )
  expect(parsePlannedTable([HEADER, ['не адрес', 'А', 'Б', 'В', 'Г']]).error).toContain('Строка 2:')
  expect(parsePlannedTable([HEADER, [...ok, 'лишнее']]).error).toContain('Строка 2: ячеек больше')
  // Nothing is partly accepted.
  expect(parsePlannedTable([HEADER, ok, ['b@example.com']]).entries).toEqual([])
})

test('an empty table is not an error, and no more than one import takes is kept', () => {
  expect(parsePlannedTable([])).toEqual({ entries: [], error: null, truncated: false })
  const rows = Array.from({ length: PLANNED_IMPORT_MAX + 3 }, (_, index) => [`p${index}@example.com`, 'А', 'Б', 'В', 'Г'])
  const parsed = parsePlannedTable([HEADER, ...rows])
  expect(parsed.entries).toHaveLength(PLANNED_IMPORT_MAX)
  expect(parsed.truncated).toBe(true)
})

test('filters by who has signed up and names people by name, else by address', () => {
  const person = (email: string, registered: boolean, fullName: string | null = null): PlannedParticipant => ({
    id: email,
    email,
    firstName: fullName,
    lastName: null,
    department: null,
    city: null,
    hasPhoto: false,
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
    firstName: null,
    lastName: null,
    department: null,
    city: null,
    hasPhoto: false,
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
  const base = { firstName: 'Ольга', lastName: 'Хостесова', department: null, city: null, hasPhoto: false, registeredAt: null, kind: 'hostess', registered: true } as const
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
