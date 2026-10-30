import { expect, test } from 'bun:test'
import type { FlaskIdea } from '@event-tracking-system/contracts'

import {
  advance,
  flaskIdeaUrl,
  ingest,
  initialFlaskState,
  liquidLevel,
  newIdeas,
  QUEUE_MAX,
  RESTING_MAX,
  restingPosition,
} from '../src/features/flask/model'

const idea = (id: string): FlaskIdea => ({
  id,
  createdAt: '2026-01-01T00:00:00.000Z',
  participant: { fullName: `P ${id}`, initials: 'ПП', photo: null },
})
const ideas = (n: number, from = 0) => Array.from({ length: n }, (_, i) => idea(`i${from + i}`))

test('newIdeas keeps only ids not seen yet', () => {
  expect(newIdeas(new Set(['a']), [idea('a'), idea('b')]).map((i) => i.id)).toEqual(['b'])
})

test('the first load fills the flask without any animation', () => {
  const state = ingest(initialFlaskState, ideas(5))
  expect(state.resting).toHaveLength(5)
  expect(state.current).toBeNull()
  expect(state.queue).toEqual([])
  expect(ingest(state, ideas(5))).toBe(state)
})

test('a new id goes on stage; more wait in the queue in order', () => {
  const first = ingest(initialFlaskState, ideas(2))
  const next = ingest(first, ideas(4))
  expect(next.current?.idea.id).toBe('i2')
  expect(next.queue.map((i) => i.id)).toEqual(['i3'])
  const done = advance(next)
  expect(done.resting.map((p) => p.idea.id)).toEqual(['i0', 'i1', 'i2'])
  expect(done.current?.idea.id).toBe('i3')
  expect(advance(done).current).toBeNull()
})

test('arrivals beyond the queue limit rest in the flask silently', () => {
  const first = ingest(initialFlaskState, ideas(1))
  const burst = ingest(first, ideas(1 + QUEUE_MAX + 3))
  expect(burst.current).not.toBeNull()
  // 1 on stage + 9 queued = 10 waiting; the last 3 of the 13 new ones rest at once.
  expect(burst.queue).toHaveLength(QUEUE_MAX - 1)
  expect(burst.resting.map((p) => p.idea.id)).toContain('i13')
})

test('the flask never holds more than the server sends', () => {
  const state = ingest(initialFlaskState, ideas(RESTING_MAX + 5))
  expect(state.resting).toHaveLength(RESTING_MAX)
})

test('liquid level grows with the total and is capped', () => {
  expect(liquidLevel(0)).toBeGreaterThan(0)
  expect(liquidLevel(10)).toBeGreaterThan(liquidLevel(0))
  expect(liquidLevel(1_000_000)).toBe(1)
  expect(liquidLevel(-5)).toBe(liquidLevel(0))
})

test('resting positions stay inside the flask body', () => {
  for (let slot = 0; slot < 500; slot++) {
    const { x, y } = restingPosition(slot)
    expect(x).toBeGreaterThanOrEqual(70)
    expect(x).toBeLessThan(330)
    expect(y).toBeGreaterThanOrEqual(290)
    expect(y).toBeLessThanOrEqual(415)
  }
})

test('the QR address is the participant page on the same origin', () => {
  expect(flaskIdeaUrl('https://event.example')).toBe('https://event.example/app/ideas')
})
