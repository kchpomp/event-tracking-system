import type { Live, ScheduledTeam, UpdateLiveRequest } from '@event-tracking-system/contracts'

import { formatDate, formatTime } from '@/platform/intl'

const REMINDER_MS = 10 * 60_000

type Slot = Pick<ScheduledTeam, 'startsAt' | 'endsAt'>

/**
 * The server clock as the device sees it: `Date.now() + (serverNow - fetchedAt)`. A wrong device
 * clock then moves "now" and the slots together, so it changes nothing.
 */
export function serverClockOffset(serverNow: string, fetchedAtMs: number) {
  return Date.parse(serverNow) - fetchedAtMs
}

/** The slot as milliseconds, or null when the team has none. */
function bounds(slot: Slot) {
  return slot.startsAt && slot.endsAt ? ([Date.parse(slot.startsAt), Date.parse(slot.endsAt)] as const) : null
}

/** Start inclusive, end exclusive. */
export function isPerformingNow(slot: Slot, now: number) {
  const range = bounds(slot)
  return range !== null && range[0] <= now && now < range[1]
}

/** The administrator picked this team as live, so the schedule no longer decides for it. */
export function isLiveByOverride(team: Pick<ScheduledTeam, 'id'>, live: Live) {
  return live.override && live.teamId === team.id
}

/** Override on: exactly the chosen team. Override off: the team whose slot contains `now`. */
export function isLiveNow(team: Pick<ScheduledTeam, 'id'> & Slot, live: Live, now: number) {
  return live.override ? live.teamId === team.id : isPerformingNow(team, now)
}

/** The select value for the current live state: `auto`, `none`, or a team id. */
export function liveSelectValue(live: Live) {
  return live.override ? (live.teamId ?? 'none') : 'auto'
}

/** The inverse of `liveSelectValue`: a select value as the request body. */
export function liveRequestFromValue(value: string): UpdateLiveRequest {
  if (value === 'auto') return { mode: 'auto' }
  if (value === 'none') return { mode: 'none' }
  return { mode: 'team', teamId: value }
}

/** Whole minutes to the start, rounded up and at least 1: "через 1 мин" until the very start. */
export function minutesUntil(startsAt: string, now: number) {
  return Math.max(1, Math.ceil((Date.parse(startsAt) - now) / 60_000))
}

/** Teams that start in 10 minutes or less and have not started: `0 < startsAt - now <= 10 min`. */
export function startingSoon<T extends Slot>(teams: readonly T[], now: number) {
  return teams.filter((team) => {
    const range = bounds(team)
    return range !== null && range[0] > now && range[0] - now <= REMINDER_MS
  })
}

/** One reminder per team and start: a moved start is a new reminder. */
export function reminderKey(team: Pick<ScheduledTeam, 'id' | 'startsAt'>) {
  return `${team.id}@${team.startsAt}`
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

/** `14:00–15:30`, with the date in front when the start is not today; null without a slot. */
export function slotLabel(slot: Slot, now: number) {
  const range = bounds(slot)
  if (!range) return null
  const [start, end] = range
  const times = `${formatTime(start)}–${formatTime(end)}`
  return sameDay(new Date(start), new Date(now)) ? times : `${formatDate(new Date(start))}, ${times}`
}

const pad = (value: number) => String(value).padStart(2, '0')

/** An ISO instant as the value of `<input type="datetime-local">` in the device time zone. */
export function isoToLocalInput(iso: string | null) {
  if (!iso) return ''
  const date = new Date(iso)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** The value of `<input type="datetime-local">` (device time zone) as an ISO UTC instant; null when empty. */
export function localInputToIso(value: string) {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : new Date(time).toISOString()
}
