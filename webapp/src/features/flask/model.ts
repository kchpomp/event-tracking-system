import type { FlaskIdea } from '@event-tracking-system/contracts'

/** The drop takes about two seconds; the caption stays five. One arrival holds the stage that long. */
export const ARRIVAL_MS = 5_000
/** Arrivals waiting for the stage; the rest go into the flask without an animation. */
export const QUEUE_MAX = 10
/** The server sends the latest 40; the flask never holds more bulbs than that. */
export const RESTING_MAX = 40
/** The liquid is full at this many ideas. */
const LIQUID_FULL_AT = 100
/** Even an empty flask shows a little liquid. */
const LIQUID_MIN = 0.1

export type Placed = { idea: FlaskIdea; slot: number }

export type FlaskState = {
  started: boolean
  seen: ReadonlySet<string>
  resting: Placed[]
  nextSlot: number
  /** The arrival on stage now: its bulb drops and its caption shows. */
  current: Placed | null
  queue: FlaskIdea[]
}

export const initialFlaskState: FlaskState = {
  started: false,
  seen: new Set(),
  resting: [],
  nextSlot: 0,
  current: null,
  queue: [],
}

/** Ideas whose id is not in `seen`, in the order given (oldest first). */
export function newIdeas(seen: ReadonlySet<string>, ideas: ReadonlyArray<FlaskIdea>) {
  return ideas.filter((idea) => !seen.has(idea.id))
}

function rest(resting: Placed[], added: Placed[]) {
  return [...resting, ...added].slice(-RESTING_MAX)
}

function promote(state: FlaskState): FlaskState {
  if (state.current || state.queue.length === 0) return state
  const [idea, ...queue] = state.queue
  return { ...state, current: { idea: idea!, slot: state.nextSlot }, nextSlot: state.nextSlot + 1, queue }
}

/** A poll result. The first one only fills the flask; later ones queue what is new. */
export function ingest(state: FlaskState, ideas: ReadonlyArray<FlaskIdea>): FlaskState {
  const seen = new Set(state.seen)
  if (!state.started) {
    for (const idea of ideas) seen.add(idea.id)
    const resting = ideas.map((idea, slot) => ({ idea, slot })).slice(-RESTING_MAX)
    return { ...state, started: true, seen, resting, nextSlot: ideas.length }
  }
  const fresh = newIdeas(state.seen, ideas)
  if (fresh.length === 0) return state
  for (const idea of fresh) seen.add(idea.id)
  const room = Math.max(0, QUEUE_MAX - state.queue.length)
  const silent = fresh.slice(room).map((idea, index) => ({ idea, slot: state.nextSlot + index }))
  return promote({
    ...state,
    seen,
    resting: rest(state.resting, silent),
    nextSlot: state.nextSlot + silent.length,
    queue: [...state.queue, ...fresh.slice(0, room)],
  })
}

/** The stage time is over: the current bulb rests in the flask and the next arrival comes on. */
export function advance(state: FlaskState): FlaskState {
  if (!state.current) return promote(state)
  return promote({ ...state, resting: rest(state.resting, [state.current]), current: null })
}

/** 0..1: how full the flask looks. Capped, so it never overflows. */
export function liquidLevel(total: number) {
  const share = Math.min(Math.max(total, 0) / LIQUID_FULL_AT, 1)
  return LIQUID_MIN + (1 - LIQUID_MIN) * share
}

/** The cone of the flask in drawing space: the walls widen from the neck at y 175 by this much per unit of y. */
const CONE_TOP = 175
const CONE_SLOPE = 0.458
const BULB_MARGIN = 24

/** Where the bulb of a slot rests in the flask body (flask drawing space), spread by a fixed hash, inside the walls. */
export function restingPosition(slot: number) {
  // Low-discrepancy (R2) steps spread the slots evenly in both directions, so bulbs seldom overlap.
  const y = 290 + ((slot * 0.569840291) % 1) * 125
  const reach = (y - CONE_TOP) * CONE_SLOPE
  const left = 158 - reach + BULB_MARGIN
  const right = 242 + reach - BULB_MARGIN
  return { x: left + ((slot * 0.754877666) % 1) * (right - left), y }
}

/** The address behind the QR code: the participant's page of the flask (a guest is sent to sign in first). */
export function flaskIdeaUrl(origin: string) {
  return `${origin}/app/ideas`
}

export function arrivalCaption(idea: FlaskIdea) {
  return `${idea.participant.fullName} добавил(а) идею`
}
