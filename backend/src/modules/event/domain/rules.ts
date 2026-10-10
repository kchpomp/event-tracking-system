import { DIFFUSION_GOAL, IDEA_GOAL } from '@event-tracking-system/contracts'

// The scoring weights are PLACEHOLDERS carried over from the earlier project: change them here.

/** One point for each of the first IDEA_GOAL ideas, none after. `earlierIdeas` = ledger rows so far. */
export function ideaPoints(earlierIdeas: number) {
  return earlierIdeas < IDEA_GOAL ? 1 : 0
}

/** One point per new connection for each of the two people, for their first DIFFUSION_GOAL only. */
export function connectionPoints(earlierConnections: number) {
  return earlierConnections < DIFFUSION_GOAL ? 1 : 0
}

/** A connection is one row per unordered pair, stored lowest id first. */
export function orderedPair(first: string, second: string): [string, string] {
  return first < second ? [first, second] : [second, first]
}

type Named = { firstName: string | null; lastName: string | null; displayName: string | null }

/** First and last name, else the display name, else «Участник»: as the leaderboard shows people. */
export function participantFullName(user: Named) {
  return (
    [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
    user.displayName?.trim() ||
    'Участник'
  )
}

/** A staff search split into words: «Анна Петрова» must match first name Анна AND last name Петрова. */
export function searchWords(query: string) {
  return query.trim().split(/\s+/).filter(Boolean).slice(0, 5)
}

type Workplace = { cityId: string | null; companyId: string | null }

/**
 * RULE (delete this function's use to drop it): two people who share BOTH the city and the company
 * cannot connect. Both come from the reference lists, so ids are compared; an unknown (null)
 * value never blocks, as in the earlier project.
 */
export function sameCityAndCompany(me: Workplace, other: Workplace) {
  return (
    me.cityId !== null &&
    me.companyId !== null &&
    me.cityId === other.cityId &&
    me.companyId === other.companyId
  )
}

const nameWords = (value: string) =>
  value
    .toLowerCase()
    .replaceAll('ё', 'е')
    .split(/\s+/)
    .map((word) => word.replace(/^[.,]+|[.,]+$/g, ''))
    .filter(Boolean)

/**
 * Whether a name from an expected-guest list is the account's person: the first AND the last name
 * both appear in it, in any order and case, with «ё» as «е». A patronymic or an initial around
 * them does not matter. Nothing listed, nothing matched.
 */
export function listedNameMatches(
  listed: string | null,
  account: { firstName: string | null; lastName: string | null },
) {
  if (!listed || !account.firstName || !account.lastName) return false
  const words = new Set(nameWords(listed))
  const [first, last] = [nameWords(account.firstName).join(' '), nameWords(account.lastName).join(' ')]
  const covers = (name: string) => name !== '' && nameWords(name).every((word) => words.has(word))
  return covers(first) && covers(last)
}
