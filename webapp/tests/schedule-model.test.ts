import { expect, test } from 'bun:test'

import {
  isLiveByOverride,
  isLiveNow,
  isoToLocalInput,
  isPerformingNow,
  liveRequestFromValue,
  liveSelectValue,
  localInputToIso,
  minutesUntil,
  reminderKey,
  serverClockOffset,
  slotLabel,
  startingSoon,
} from '../src/features/event/schedule-model'

const at = (iso: string) => Date.parse(iso)
const team = (id: string, startsAt: string | null, endsAt: string | null) => ({ id, name: id, startsAt, endsAt })

test('datetime-local converts to ISO UTC and back without drift', () => {
  const iso = localInputToIso('2026-10-28T14:05')
  expect(iso).toBe(new Date(2026, 9, 28, 14, 5).toISOString())
  expect(isoToLocalInput(iso)).toBe('2026-10-28T14:05')
  expect(localInputToIso('')).toBeNull()
  expect(isoToLocalInput(null)).toBe('')
})

test('the server clock offset puts a wrong device clock back on server time', () => {
  // The device is 1 hour fast: fetched at device 13:00 while the server says 12:00.
  const offset = serverClockOffset('2026-10-28T12:00:00Z', at('2026-10-28T13:00:00Z'))
  expect(at('2026-10-28T13:05:00Z') + offset).toBe(at('2026-10-28T12:05:00Z'))
})

test('performing now includes the start and excludes the end', () => {
  const slot = team('a', '2026-10-28T12:00:00Z', '2026-10-28T12:30:00Z')
  expect(isPerformingNow(slot, at('2026-10-28T11:59:59Z'))).toBe(false)
  expect(isPerformingNow(slot, at('2026-10-28T12:00:00Z'))).toBe(true)
  expect(isPerformingNow(slot, at('2026-10-28T12:30:00Z'))).toBe(false)
  expect(isPerformingNow(team('b', null, null), at('2026-10-28T12:10:00Z'))).toBe(false)
})

test('the reminder covers 0 < start - now <= 10 minutes and skips started teams', () => {
  const now = at('2026-10-28T12:00:00Z')
  const teams = [
    team('past', '2026-10-28T11:50:00Z', '2026-10-28T12:50:00Z'),
    team('starting', '2026-10-28T12:00:00Z', '2026-10-28T12:50:00Z'),
    team('soon', '2026-10-28T12:10:00Z', '2026-10-28T12:50:00Z'),
    team('later', '2026-10-28T12:10:01Z', '2026-10-28T12:50:00Z'),
    team('none', null, null),
  ]
  expect(startingSoon(teams, now).map((item) => item.id)).toEqual(['soon'])
})

test('minutes until the start round up and never show zero', () => {
  const now = at('2026-10-28T12:00:00Z')
  expect(minutesUntil('2026-10-28T12:10:00Z', now)).toBe(10)
  expect(minutesUntil('2026-10-28T12:04:01Z', now)).toBe(5)
  expect(minutesUntil('2026-10-28T12:00:10Z', now)).toBe(1)
})

test('a reminder is keyed by team and start', () => {
  expect(reminderKey(team('a', '2026-10-28T12:00:00Z', null))).not.toBe(
    reminderKey(team('a', '2026-10-28T13:00:00Z', null)),
  )
})

test('the slot label shows the date only when the start is not today', () => {
  const start = new Date(2026, 9, 28, 14, 0).toISOString()
  const end = new Date(2026, 9, 28, 15, 30).toISOString()
  const slot = team('a', start, end)
  expect(slotLabel(slot, new Date(2026, 9, 28, 9, 0).getTime())).toBe('14:00–15:30')
  expect(slotLabel(slot, new Date(2026, 9, 27, 9, 0).getTime())).toContain('14:00–15:30')
  expect(slotLabel(slot, new Date(2026, 9, 27, 9, 0).getTime())).not.toBe('14:00–15:30')
  expect(slotLabel(team('b', null, null), 0)).toBeNull()
})

test('live follows the schedule without an override and only the chosen team with one', () => {
  const now = at('2026-10-28T12:10:00Z')
  const a = team('a', '2026-10-28T12:00:00Z', '2026-10-28T12:30:00Z')
  const b = team('b', '2026-10-28T13:00:00Z', '2026-10-28T13:30:00Z')
  const auto = { override: false, teamId: null }
  expect(isLiveNow(a, auto, now)).toBe(true)
  expect(isLiveNow(b, auto, now)).toBe(false)
  expect(isLiveNow(a, { override: true, teamId: 'b' }, now)).toBe(false)
  expect(isLiveNow(b, { override: true, teamId: 'b' }, now)).toBe(true)
  expect(isLiveNow(a, { override: true, teamId: null }, now)).toBe(false)
  expect(isLiveByOverride(b, { override: true, teamId: 'b' })).toBe(true)
  expect(isLiveByOverride(b, { override: false, teamId: 'b' })).toBe(false)
})

test('the live select maps to and from the request', () => {
  expect(liveSelectValue({ override: false, teamId: null })).toBe('auto')
  expect(liveSelectValue({ override: true, teamId: null })).toBe('none')
  expect(liveSelectValue({ override: true, teamId: 'x' })).toBe('x')
  expect(liveRequestFromValue('auto')).toEqual({ mode: 'auto' })
  expect(liveRequestFromValue('none')).toEqual({ mode: 'none' })
  expect(liveRequestFromValue('x')).toEqual({ mode: 'team', teamId: 'x' })
})
