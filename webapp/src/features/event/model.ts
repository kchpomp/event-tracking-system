import {
  DIFFUSION_GOAL,
  IDEA_GOAL,
  POLYMER_GROUP,
  type StationSummary,
} from '@event-tracking-system/contracts'

/** Listed first on the dashboard, and its page has no scan button of its own. */
export const START_STATION = 'Точка соединения'

export type StationCard = {
  /** The id of the first station of the card; the station page of a plain station uses it. */
  id: string
  name: string
  group: string | null
  points: number[]
  done: boolean
}

/** Stations that share a display group are ONE card, done when any of them was scanned. */
export function toStationCards(stations: StationSummary[]): StationCard[] {
  const cards = new Map<string, StationCard>()
  for (const station of stations) {
    const key = station.displayGroup ?? station.id
    const card = cards.get(key) ?? {
      id: station.id,
      name: station.name,
      group: station.displayGroup,
      points: [],
      done: false,
    }
    card.points.push(station.points)
    card.done ||= station.visited
    cards.set(key, card)
  }
  return [...cards.values()]
}

/** Each of the ten «Полимер решений» QR codes is a placement: 10 points = 1st place ... 1 = 10th. */
export function stationLabel(station: Pick<StationSummary, 'name' | 'displayGroup' | 'points'>) {
  return station.displayGroup === POLYMER_GROUP
    ? `${station.name}: место ${11 - station.points}`
    : station.name
}

export function isPolymerCard(card: Pick<StationCard, 'group'>) {
  return card.group === POLYMER_GROUP
}

/** "3" for one value, "до 10" when a card's QR codes are worth different amounts. */
export function pointsLabel(points: number[]) {
  const max = Math.max(...points)
  return Math.min(...points) === max ? `${max}` : `до ${max}`
}

/** "1 очко", "2 очка", "5 очков", "11 очков", "21 очко": the Russian plural of a points count. */
const POINTS_PLURAL = new Intl.PluralRules('ru')
const POINTS_WORD = { one: 'очко', few: 'очка', many: 'очков', other: 'очков', zero: 'очков', two: 'очка' }

export function pointsWord(count: number) {
  return `${count} ${POINTS_WORD[POINTS_PLURAL.select(count)]}`
}

export type ActivityProgress = {
  /** Both counters stop at their goal: the rest is accepted but neither scored nor shown. */
  ideas: number
  links: number
  doneActivities: number
  totalActivities: number
  percent: number
  /** 0..4: a new colour every 20 percent, soft yellow to soft green. */
  step: number
}

/** Activities = the station cards + "Диффузия" (3 of 3) + "Колба идей" (5 of 5). */
export function activityProgress(
  cards: Pick<StationCard, 'done'>[],
  ideasCount: number,
  connectionsCount: number,
): ActivityProgress {
  const ideas = Math.min(ideasCount, IDEA_GOAL)
  const links = Math.min(connectionsCount, DIFFUSION_GOAL)
  const doneActivities =
    cards.filter((card) => card.done).length +
    Number(links >= DIFFUSION_GOAL) +
    Number(ideas >= IDEA_GOAL)
  const totalActivities = cards.length + 2
  const percent = Math.round((doneActivities / totalActivities) * 100)
  return {
    ideas,
    links,
    doneActivities,
    totalActivities,
    percent,
    step: Math.min(4, Math.floor(percent / 20)),
  }
}

/** A QR may encode a URL ending in the token or the bare token; a scanner may add spaces or a break. */
export function tokenFrom(decodedText: string) {
  const text = decodedText.trim()
  try {
    return new URL(text).pathname.split('/').filter(Boolean).pop() ?? text
  } catch {
    return text
  }
}

export function fullName(profile: { firstName: string | null; lastName: string | null }) {
  return [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Участник'
}

/** These stations are entered through the global scan button, so their pages have none. */
export function hasOwnScanButton(name: string) {
  return !/^(точка соединения|люди формулы будущего|воркшоп)/i.test(name)
}
