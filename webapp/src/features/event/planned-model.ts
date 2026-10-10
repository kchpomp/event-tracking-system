import {
  PLANNED_IMPORT_MAX,
  type PlannedKind,
  type PlannedParticipant,
} from '@event-tracking-system/contracts'

const EMAIL = /[^\s;,<>"']+@[^\s;,<>"']+\.[^\s;,<>"']+/

export type ParsedPlanned = {
  entries: { email: string; fullName?: string }[]
  /** Non-empty lines without an address, as typed, so the administrator can fix them. */
  invalid: string[]
  /** More lines than one import accepts: nothing beyond the limit is in `entries`. */
  truncated: boolean
}

/**
 * Reads what an administrator pastes: one person per line, an address with an optional name in any
 * order and separated by a comma, a semicolon, a tab or `<address>` brackets («Анна Петрова
 * <anna@example.com>», «anna@example.com; Анна Петрова», a copied spreadsheet row).
 */
export function parsePlannedLines(text: string): ParsedPlanned {
  const entries: ParsedPlanned['entries'] = []
  const invalid: string[] = []

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const match = EMAIL.exec(line)
    if (!match) {
      invalid.push(line)
      continue
    }
    const name = line
      .replace(match[0], ' ')
      .replace(/[;,\t<>"]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    entries.push({ email: match[0].toLowerCase(), ...(name ? { fullName: name.slice(0, 200) } : {}) })
  }

  return {
    entries: entries.slice(0, PLANNED_IMPORT_MAX),
    invalid,
    truncated: entries.length > PLANNED_IMPORT_MAX,
  }
}

export type PlannedFilter = 'all' | 'pending' | 'registered'

export function filterPlanned(items: readonly PlannedParticipant[], filter: PlannedFilter) {
  if (filter === 'all') return items
  return items.filter((item) => item.registered === (filter === 'registered'))
}

export function plannedLabel(item: Pick<PlannedParticipant, 'email' | 'fullName'>) {
  return item.fullName ?? item.email
}

export const KIND_TEXT = {
  participant: {
    plural: 'Участники',
    planned: 'Участников планируется',
    registered: 'Зарегистрировались',
    actual: 'Всего аккаунтов участников',
    file: 'participants-not-registered.csv',
  },
  hostess: {
    plural: 'Хостесс',
    planned: 'Хостесс планируется',
    registered: 'Зарегистрировались',
    actual: 'Всего с ролью хостес',
    file: 'hostesses-not-registered.csv',
  },
} as const satisfies Record<PlannedKind, Record<string, string>>

export function ofKind(items: readonly PlannedParticipant[], kind: PlannedKind) {
  return items.filter((item) => item.kind === kind)
}

/** One line of status for a person in a list. A hostess needs the role as well as the account. */
export function plannedStatus(item: Pick<PlannedParticipant, 'kind' | 'registered' | 'role'>) {
  if (!item.registered) return { done: false, text: 'Не зарегистрирован(а)' }
  if (item.kind === 'hostess' && item.role !== 'hostess') {
    return { done: false, text: 'Аккаунт есть, роль хостес не назначена' }
  }
  return { done: true, text: item.kind === 'hostess' ? 'Зарегистрирована, роль назначена' : 'Зарегистрирован(а)' }
}

/** Listed hostesses with an account that still has the participant role. */
export function hostessesWithoutRole(items: readonly PlannedParticipant[]) {
  return ofKind(items, 'hostess').filter((item) => item.registered && item.role !== 'hostess')
}

/**
 * Of those, the ones the role can be given to with one button: the account name holds the listed
 * first and last name. The rest (listed without a name, or another name) are shown with the name
 * of the account so the administrator can decide, and assign the role on the users page.
 */
export function readyForHostessRole(items: readonly PlannedParticipant[]) {
  return hostessesWithoutRole(items).filter(
    (item) => item.role === 'user' && item.nameMatches === true && item.userId !== null,
  )
}
