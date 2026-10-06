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
