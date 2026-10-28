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

/** Shown on the network screen for a participant with no letter anywhere in the profile. */
export const NEUTRAL_INITIALS = '•'

const firstLetter = (value: string | null) => value?.match(/\p{L}/u)?.[0]?.toLocaleUpperCase('ru') ?? null

/**
 * The network screen's circle label: the first letter of the first name and of the last name,
 * capitals (Кремнев Иван → «ИК»). Without both, the first letters of the first two words of the
 * display name; then any one letter there is; then a neutral symbol. A double surname gives one
 * letter, its first.
 */
export function participantInitials(user: Named) {
  const first = firstLetter(user.firstName)
  const last = firstLetter(user.lastName)
  if (first && last) return first + last

  const words = (user.displayName ?? '').split(/\s+/).map(firstLetter).filter(Boolean)
  if (words.length >= 2) return `${words[0]}${words[1]}`
  return first ?? last ?? words[0] ?? NEUTRAL_INITIALS
}

/** A staff search split into words: «Анна Петрова» must match first name Анна AND last name Петрова. */
export function searchWords(query: string) {
  return query.trim().split(/\s+/).filter(Boolean).slice(0, 5)
}

type Workplace = { city: string | null; company: string | null }

const normalized = (value: string | null) => value?.trim().toLowerCase() ?? null

/**
 * RULE (delete this function's use to drop it): two people who share BOTH the city and the company
 * cannot connect. Free text, compared case- and whitespace-insensitively; an unknown (null) value
 * never blocks, as in the earlier project.
 */
export function sameCityAndCompany(me: Workplace, other: Workplace) {
  const city = normalized(me.city)
  const company = normalized(me.company)
  return (
    city !== null &&
    company !== null &&
    city === normalized(other.city) &&
    company === normalized(other.company)
  )
}
