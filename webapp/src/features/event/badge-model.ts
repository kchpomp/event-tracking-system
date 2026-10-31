import type { BadgeStatus, HostessBadgeStatus } from '@event-tracking-system/contracts'

const BALL_PLURAL = new Intl.PluralRules('ru')
const BALL_WORD = { one: 'балл', few: 'балла', many: 'баллов', other: 'баллов', zero: 'баллов', two: 'балла' }

/** "1 балл", "2 балла", "5 баллов". */
export function ballsWord(count: number) {
  return `${count} ${BALL_WORD[BALL_PLURAL.select(count)]}`
}

export type BadgeState = 'issued' | 'eligible' | 'locked'

export function badgeState(status: Pick<BadgeStatus, 'eligible' | 'issued'>): BadgeState {
  if (status.issued) return 'issued'
  return status.eligible ? 'eligible' : 'locked'
}

/** What the hostess sees after a scan: only the `issue` state has a confirm button. */
export function hostessBadgeDialog(status: HostessBadgeStatus): {
  kind: BadgeState
  title: string
  message: string
} {
  const kind = badgeState(status)
  if (kind === 'issued') {
    return { kind, title: 'Значок уже выдан', message: `Участнику ${status.participant.fullName} значок уже выдан.` }
  }
  if (kind === 'eligible') {
    return {
      kind,
      title: 'Выдать значок?',
      message: `Участнику ${status.participant.fullName} можно выдать значок. Он получит ещё ${ballsWord(status.points)}.`,
    }
  }
  return {
    kind,
    title: 'Значок выдать нельзя',
    message: `Значок пока выдать нельзя: пройдено ${status.completed} из ${status.required} активностей.`,
  }
}

export function badgeIssuedMessage(points: number) {
  return `Значок выдан, участник получил ${ballsWord(points)}`
}

/** True only for the moment `issued` turns on while the page is open (never for the first reading). */
export function badgeJustIssued(previous: boolean | undefined, current: boolean | undefined) {
  return previous === false && current === true
}

/** One line under the progress on the participant's badge page. */
export function badgeStatusText(status: Pick<BadgeStatus, 'completed' | 'eligible' | 'issued' | 'required'>) {
  const kind = badgeState(status)
  if (kind === 'issued') return 'Значок получен'
  if (kind === 'eligible') return 'Можно получить значок: покажите QR-код куратору на мерч-точке'
  return `Значок пока недоступен: пройдите ещё ${activitiesWord(Math.max(status.required - status.completed, 0))}`
}

const ACTIVITY_WORD = { one: 'активность', few: 'активности', many: 'активностей', other: 'активностей', zero: 'активностей', two: 'активности' }

/** "1 активность", "2 активности", "5 активностей". */
function activitiesWord(count: number) {
  return `${count} ${ACTIVITY_WORD[BALL_PLURAL.select(count)]}`
}

/** The activities that count towards the badge, in the order of the forum programme. */
export const BADGE_ACTIVITIES = [
  'Точка соединения',
  'Диффузия',
  'Колба идей',
  'Полимер решений',
  'Люди формулы будущего',
  'Воркшоп 1',
  'Воркшоп 2',
  'Воркшоп 3',
] as const

/** The full list with a done flag; a completed activity outside the list (an extra station) is kept at the end. */
export function badgeChecklist(completed: readonly { name: string }[]) {
  const done = new Set(completed.map((activity) => activity.name))
  const listed: string[] = [...BADGE_ACTIVITIES]
  const extra = [...done].filter((name) => !listed.includes(name))
  return [...listed, ...extra].map((name) => ({ name, done: done.has(name) }))
}
