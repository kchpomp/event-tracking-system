import { expect, test } from 'bun:test'
import type { NetworkResponse } from '@event-tracking-system/contracts'

import {
  degreeTier,
  freshKeys,
  mergeSnapshot,
  nextFreshExpiry,
  nodeRadius,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  type ScreenGraph,
} from '../src/features/network/model'

const radius = 30
// A fixed sequence instead of Math.random, so placement is repeatable.
function sequence(values = [0.1, 0.7, 0.4, 0.9, 0.2, 0.6, 0.3, 0.8, 0.5]) {
  let index = 0
  return () => values[index++ % values.length]!
}
const at = (now: number) => ({ now, radius, random: sequence() })

const node = (id: string, initials = 'АБ') => ({ id, initials })
const snapshot = (ids: string[], edges: Array<[string, string]> = []): NetworkResponse => ({
  nodes: ids.map((id) => node(id)),
  edges: edges.map(([a, b]) => ({ a, b })),
})
const byId = (graph: ScreenGraph, id: string) => graph.nodes.find((item) => item.id === id)!

test('the first snapshot places everyone inside the screen and highlights nothing', () => {
  const { graph, changed } = mergeSnapshot(null, snapshot(['a', 'b', 'c'], [['a', 'b']]), at(1000))
  expect(changed).toBe(true)
  for (const item of graph.nodes) {
    expect(item.x).toBeGreaterThanOrEqual(radius)
    expect(item.x).toBeLessThanOrEqual(SCREEN_WIDTH - radius)
    expect(item.y).toBeGreaterThanOrEqual(radius)
    expect(item.y).toBeLessThanOrEqual(SCREEN_HEIGHT - radius)
  }
  const fresh = freshKeys(graph, 1000)
  expect(fresh.nodes.size + fresh.edges.size).toBe(0)
})

test('people already on the screen keep their positions when a snapshot arrives', () => {
  const first = mergeSnapshot(null, snapshot(['a', 'b']), at(0)).graph
  const moved: ScreenGraph = {
    ...first,
    nodes: first.nodes.map((item) => ({ ...item, x: item.id === 'a' ? 500 : 900, y: 400, vx: 1, vy: -1 })),
  }
  const { graph } = mergeSnapshot(moved, snapshot(['a', 'b', 'c']), at(5000))
  expect(byId(graph, 'a')).toMatchObject({ x: 500, y: 400, vx: 1, vy: -1 })
  expect(byId(graph, 'b')).toMatchObject({ x: 900, y: 400 })
})

test('a newcomer with a link appears next to that person; one without a link on free space', () => {
  const first = mergeSnapshot(null, snapshot(['a']), at(0)).graph
  const placedA = { ...first, nodes: first.nodes.map((item) => ({ ...item, x: 960, y: 540 })) }

  const linked = mergeSnapshot(placedA, snapshot(['a', 'b'], [['a', 'b']]), at(1)).graph
  const b = byId(linked, 'b')
  expect(Math.hypot(b.x - 960, b.y - 540)).toBeCloseTo(2 * radius + 16, 5)

  const alone = mergeSnapshot(placedA, snapshot(['a', 'c']), at(1)).graph
  const c = byId(alone, 'c')
  // Free space: well away from the only person on the screen.
  expect(Math.hypot(c.x - 960, c.y - 540)).toBeGreaterThan(4 * radius)
})

test('a reversed or repeated pair is one line, and lines to unknown or removed people are dropped', () => {
  const { graph } = mergeSnapshot(
    null,
    snapshot(['a', 'b'], [['a', 'b'], ['b', 'a'], ['a', 'b'], ['a', 'ghost'], ['a', 'a']]),
    at(0),
  )
  expect(graph.edges.map((edge) => edge.key)).toEqual(['a|b'])
  expect(byId(graph, 'a').degree).toBe(1)

  const removed = mergeSnapshot(graph, snapshot(['a']), at(10)).graph
  expect(removed.nodes.map((item) => item.id)).toEqual(['a'])
  expect(removed.edges).toEqual([])
  expect(byId(removed, 'a').degree).toBe(0)
})

test('an unchanged snapshot keeps the same graph, so the layout is not shaken', () => {
  const first = mergeSnapshot(null, snapshot(['a', 'b'], [['a', 'b']]), at(0)).graph
  const again = mergeSnapshot(first, snapshot(['b', 'a'], [['b', 'a']]), at(4000))
  expect(again.changed).toBe(false)
  expect(again.graph).toBe(first)

  const renamed = mergeSnapshot(first, { ...snapshot(['a', 'b'], [['a', 'b']]), nodes: [node('a', 'ИК'), node('b')] }, at(8000))
  expect(renamed.changed).toBe(true)
  expect(byId(renamed.graph, 'a').initials).toBe('ИК')
})

test('new people and lines are highlighted briefly, at most a few at a time', () => {
  const first = mergeSnapshot(null, snapshot(['a']), at(0)).graph
  const ids = ['a', ...Array.from({ length: 10 }, (_, index) => `n${index}`)]
  const { graph } = mergeSnapshot(first, snapshot(ids, [['a', 'n0']]), at(10_000))

  const fresh = freshKeys(graph, 10_500)
  expect(fresh.nodes.has('a')).toBe(false)
  expect(fresh.nodes.size).toBeLessThanOrEqual(6)
  expect(fresh.edges.has('a|n0')).toBe(true)
  expect(nextFreshExpiry(graph, 10_500)).toBeGreaterThan(0)

  const later = freshKeys(graph, 10_000 + 60_000)
  expect(later.nodes.size + later.edges.size).toBe(0)
  expect(nextFreshExpiry(graph, 10_000 + 60_000)).toBeNull()
})

test('the colour tier follows the «Диффузия» goal: none, one or two, three and more', () => {
  expect([0, 1, 2, 3, 9].map(degreeTier)).toEqual(['none', 'some', 'some', 'goal', 'goal'])
})

test('circles shrink as the room fills, within readable bounds', () => {
  expect(nodeRadius(10)).toBeGreaterThan(nodeRadius(200))
  expect(nodeRadius(200)).toBeGreaterThanOrEqual(28)
  expect(nodeRadius(5000)).toBeGreaterThanOrEqual(16)
  expect(nodeRadius(0)).toBeLessThanOrEqual(44)
})
