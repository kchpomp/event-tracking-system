import { DIFFUSION_GOAL, type NetworkResponse } from '@event-tracking-system/contracts'

// The screen draws in a fixed 1920×1080 space and the SVG scales it to the display, so a 1280 px
// window shows the same picture, smaller.
export const SCREEN_WIDTH = 1920
export const SCREEN_HEIGHT = 1080
/** How long a new circle or line keeps its accent. */
export const FRESH_MS = 2500
/** At most this many circles (and as many lines) carry the accent at once, e.g. after a break. */
export const FRESH_MAX = 6

export type ScreenNode = {
  id: string
  initials: string
  /** Lines this person has on the screen. */
  degree: number
  /** When the screen first saw the person; null for everyone on the first snapshot. */
  bornAt: number | null
  x: number
  y: number
  vx: number
  vy: number
}

export type ScreenEdge = {
  /** `a|b`, lowest id first: one key per unordered pair. */
  key: string
  a: string
  b: string
  bornAt: number | null
}

export type ScreenGraph = { nodes: ScreenNode[]; edges: ScreenEdge[] }

export type DegreeTier = 'none' | 'some' | 'goal'

/** The circle colour: no links yet, one or two, the «Диффузия» goal (three) and more. */
export function degreeTier(degree: number): DegreeTier {
  if (degree <= 0) return 'none'
  return degree < DIFFUSION_GOAL ? 'some' : 'goal'
}

/** Circles share ~40 % of the screen; never so small that the initials stop reading from afar. */
export function nodeRadius(count: number) {
  const share = (SCREEN_WIDTH * SCREEN_HEIGHT * 0.42) / (Math.max(count, 1) * Math.PI)
  return Math.max(16, Math.min(44, Math.floor(Math.sqrt(share)) - 6))
}

/** The gap between a newcomer and the person they are linked to. */
export const neighbourDistance = (radius: number) => 2 * radius + 16

type MergeContext = {
  now: number
  radius: number
  /** Math.random in the app; a fixed sequence in tests. */
  random: () => number
}

/**
 * Folds a server snapshot into what the screen shows. People already on the screen keep their
 * position and speed, so a poll never reshuffles the picture. A newcomer starts next to someone
 * they are linked to, or on the freest spot. People and lines missing from the snapshot leave.
 * An unchanged snapshot returns the previous graph itself: nothing to re-render or re-heat.
 */
export function mergeSnapshot(
  previous: ScreenGraph | null,
  snapshot: NetworkResponse,
  { now, radius, random }: MergeContext,
): { graph: ScreenGraph; changed: boolean } {
  const known = new Map(previous?.nodes.map((item) => [item.id, item]))
  const ids = new Set(snapshot.nodes.map((item) => item.id))

  const pairs = new Map<string, { a: string; b: string }>()
  for (const edge of snapshot.edges) {
    if (edge.a === edge.b || !ids.has(edge.a) || !ids.has(edge.b)) continue
    const [a, b] = edge.a < edge.b ? [edge.a, edge.b] : [edge.b, edge.a]
    pairs.set(`${a}|${b}`, { a, b })
  }

  const unchanged =
    previous !== null &&
    previous.nodes.length === snapshot.nodes.length &&
    previous.edges.length === pairs.size &&
    snapshot.nodes.every((item) => known.get(item.id)?.initials === item.initials) &&
    previous.edges.every((edge) => pairs.has(edge.key))
  if (unchanged) return { graph: previous, changed: false }

  const bornAt = previous === null ? null : now
  const previousEdges = new Map(previous?.edges.map((edge) => [edge.key, edge]))
  const edges: ScreenEdge[] = [...pairs].map(([key, pair]) => ({
    key,
    ...pair,
    bornAt: previousEdges.get(key)?.bornAt ?? bornAt,
  }))

  const degree = new Map<string, number>()
  const partners = new Map<string, string[]>()
  for (const edge of edges) {
    for (const [self, other] of [
      [edge.a, edge.b],
      [edge.b, edge.a],
    ] as const) {
      degree.set(self, (degree.get(self) ?? 0) + 1)
      partners.set(self, [...(partners.get(self) ?? []), other])
    }
  }

  // Everyone already on the screen first, so newcomers can be placed against them.
  const placed = new Map<string, ScreenNode>()
  for (const item of snapshot.nodes) {
    const existing = known.get(item.id)
    if (existing) {
      placed.set(item.id, { ...existing, initials: item.initials, degree: degree.get(item.id) ?? 0 })
    }
  }
  snapshot.nodes.forEach((item, index) => {
    if (placed.has(item.id)) return
    const partner = partners.get(item.id)?.map((id) => placed.get(id)).find(Boolean)
    // The first snapshot starts as a centred spiral that the layout then spreads.
    const spot =
      previous === null
        ? spiral(index, radius)
        : partner
          ? nextTo(partner, radius, random)
          : freeSpot([...placed.values()], radius, random)
    placed.set(item.id, {
      id: item.id,
      initials: item.initials,
      degree: degree.get(item.id) ?? 0,
      bornAt,
      ...spot,
      vx: 0,
      vy: 0,
    })
  })

  return {
    graph: { nodes: snapshot.nodes.map((item) => placed.get(item.id)!), edges },
    changed: true,
  }
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

/** Phyllotaxis around the centre, wider than tall, like the screen. */
function spiral(index: number, radius: number) {
  const distance = (radius + 8) * Math.sqrt(index + 0.5)
  const angle = index * GOLDEN_ANGLE
  return {
    x: clamp(SCREEN_WIDTH / 2 + Math.cos(angle) * distance * 1.4, radius, SCREEN_WIDTH - radius),
    y: clamp(SCREEN_HEIGHT / 2 + Math.sin(angle) * distance * 0.8, radius, SCREEN_HEIGHT - radius),
  }
}

function nextTo(partner: Pick<ScreenNode, 'x' | 'y'>, radius: number, random: () => number) {
  const angle = random() * 2 * Math.PI
  const distance = neighbourDistance(radius)
  return {
    x: clamp(partner.x + Math.cos(angle) * distance, radius, SCREEN_WIDTH - radius),
    y: clamp(partner.y + Math.sin(angle) * distance, radius, SCREEN_HEIGHT - radius),
  }
}

/** The best of a few random points: the one farthest from everybody already placed. */
function freeSpot(nodes: Array<Pick<ScreenNode, 'x' | 'y'>>, radius: number, random: () => number) {
  let best = { x: SCREEN_WIDTH / 2, y: SCREEN_HEIGHT / 2 }
  let bestDistance = -1
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const candidate = {
      x: radius + random() * (SCREEN_WIDTH - 2 * radius),
      y: radius + random() * (SCREEN_HEIGHT - 2 * radius),
    }
    let nearest = Number.POSITIVE_INFINITY
    for (const item of nodes) {
      nearest = Math.min(nearest, Math.hypot(item.x - candidate.x, item.y - candidate.y))
    }
    if (nearest > bestDistance) {
      bestDistance = nearest
      best = candidate
    }
  }
  return best
}

function freshest<T extends { bornAt: number | null }>(items: T[], now: number) {
  return items
    .filter((item) => item.bornAt !== null && now - item.bornAt < FRESH_MS)
    .sort((left, right) => right.bornAt! - left.bornAt!)
    .slice(0, FRESH_MAX)
}

/** The circles and lines that carry the accent right now. */
export function freshKeys(graph: ScreenGraph, now: number) {
  return {
    nodes: new Set(freshest(graph.nodes, now).map((item) => item.id)),
    edges: new Set(freshest(graph.edges, now).map((edge) => edge.key)),
  }
}

/** Milliseconds until the next accent fades, or null when nothing is highlighted. */
export function nextFreshExpiry(graph: ScreenGraph, now: number) {
  const ends = [...freshest(graph.nodes, now), ...freshest(graph.edges, now)].map(
    (item) => item.bornAt! + FRESH_MS - now,
  )
  return ends.length === 0 ? null : Math.min(...ends)
}
