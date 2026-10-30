import {
  PLANNED_IMPORT_MAX,
  plannedEntrySchema,
  type ImportPlannedRequest,
  type PlannedKind,
  type PlannedParticipant,
} from '@event-tracking-system/contracts'

/** What the administrator is told the list file looks like. */
export const PLANNED_FORMAT = 'почта, имя, фамилия, подразделение, город'

type EntryKey = 'email' | 'firstName' | 'lastName' | 'department' | 'city'

// The five columns, in the order the format names them; any order is accepted in a file.
const COLUMNS: ReadonlyArray<{ key: EntryKey; label: string; names: readonly string[] }> = [
  { key: 'email', label: 'почта', names: ['почта', 'email', 'e-mail'] },
  { key: 'firstName', label: 'имя', names: ['имя'] },
  { key: 'lastName', label: 'фамилия', names: ['фамилия'] },
  { key: 'department', label: 'подразделение', names: ['подразделение'] },
  { key: 'city', label: 'город', names: ['город'] },
]

export type ParsedPlanned = {
  entries: ImportPlannedRequest['entries']
  /** Why the whole file is refused (nothing is sent), in Russian, or null. */
  error: string | null
  /** More rows than one import accepts: nothing beyond the limit is in `entries`. */
  truncated: boolean
}

const normalizeHeader = (cell: string) => cell.replace(/^\uFEFF/, '').trim().toLowerCase().replaceAll('ё', 'е')

/**
 * Reads a table whose first row is the header: exactly the five columns of PLANNED_FORMAT, in any
 * order, under their Russian names (the address may also be «email»). A missing, unknown or
 * repeated column, or an empty cell, refuses the whole file with a sentence that names the place.
 * Row numbers are those of the table, header included. Blank rows are skipped.
 */
export function parsePlannedTable(rows: readonly (readonly string[])[]): ParsedPlanned {
  const refuse = (error: string): ParsedPlanned => ({ entries: [], error, truncated: false })
  const isBlank = (row: readonly string[]) => row.every((cell) => cell.trim() === '')
  const headerIndex = rows.findIndex((row) => !isBlank(row))
  if (headerIndex < 0) return { entries: [], error: null, truncated: false }

  const header = [...rows[headerIndex]!]
  while (header.length > 0 && header.at(-1)!.trim() === '') header.pop()

  const columnAt: EntryKey[] = []
  for (const [index, cell] of header.entries()) {
    const name = normalizeHeader(cell)
    const column = COLUMNS.find((candidate) => candidate.names.includes(name))
    if (name === '') return refuse(`В первой строке колонка ${index + 1} без названия.`)
    if (!column) return refuse(`Лишняя колонка «${cell.trim()}». В файле должны быть только: ${PLANNED_FORMAT}.`)
    if (columnAt.includes(column.key)) return refuse(`Колонка «${column.label}» повторяется.`)
    columnAt.push(column.key)
  }
  const missing = COLUMNS.filter((column) => !columnAt.includes(column.key))
  if (missing.length > 0) {
    return refuse(
      `Нет колонки: ${missing.map((column) => `«${column.label}»`).join(', ')}. В первой строке нужны: ${PLANNED_FORMAT}.`,
    )
  }

  const entries: ImportPlannedRequest['entries'] = []
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index]!
    if (isBlank(row)) continue
    if (row.slice(columnAt.length).some((cell) => cell.trim() !== '')) {
      return refuse(`Строка ${index + 1}: ячеек больше, чем колонок (${columnAt.length}).`)
    }
    const entry = {} as Record<EntryKey, string>
    for (const [at, key] of columnAt.entries()) {
      entry[key] = (row[at] ?? '').trim()
      if (entry[key] === '') {
        const label = COLUMNS.find((column) => column.key === key)!.label
        return refuse(`Строка ${index + 1}: пусто в колонке «${label}».`)
      }
    }
    // The shared schema also cleans the address and checks lengths, with its own Russian messages.
    const checked = plannedEntrySchema.safeParse(entry)
    if (!checked.success) return refuse(`Строка ${index + 1}: ${checked.error.issues[0]?.message ?? 'неверные данные'}.`)
    entries.push(checked.data)
  }

  return {
    entries: entries.slice(0, PLANNED_IMPORT_MAX),
    error: null,
    truncated: entries.length > PLANNED_IMPORT_MAX,
  }
}

export type PlannedFilter = 'all' | 'pending' | 'registered'

export function filterPlanned(items: readonly PlannedParticipant[], filter: PlannedFilter) {
  if (filter === 'all') return items
  return items.filter((item) => item.registered === (filter === 'registered'))
}

export function plannedName(item: Pick<PlannedParticipant, 'firstName' | 'lastName'>) {
  return [item.firstName, item.lastName].filter(Boolean).join(' ')
}

export function plannedLabel(item: Pick<PlannedParticipant, 'email' | 'firstName' | 'lastName'>) {
  return plannedName(item) || item.email
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
