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
  return `Значок пока недоступен: пройдите ещё ${Math.max(status.required - status.completed, 0)} из ${status.required} активностей`
}
