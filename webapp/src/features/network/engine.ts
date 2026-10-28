import type { NetworkResponse } from '@event-tracking-system/contracts'

import { createScreenLayout } from './layout'
import { mergeSnapshot, nodeRadius, type ScreenGraph } from './model'

/**
 * The screen's own state: the merged graph and the running layout, outside React. The component
 * reads the graph with useSyncExternalStore (it changes only when a snapshot changes something)
 * and moves the circles itself on every layout tick, so a tick never re-renders React.
 * Memory stays bounded: one graph, rebuilt from each snapshot, and one simulation.
 */
export function createNetworkEngine() {
  let graph: ScreenGraph | null = null
  let radius = nodeRadius(0)
  let draw: (() => void) | null = null
  const listeners = new Set<() => void>()
  const layout = createScreenLayout(() => draw?.())

  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    graph: () => graph,
    radius: () => radius,
    /** Called on every tick; the component moves its SVG elements here. */
    onDraw(next: (() => void) | null) {
      draw = next
    },
    ingest(snapshot: NetworkResponse, { animate, now }: { animate: boolean; now: number }) {
      const nextRadius = nodeRadius(snapshot.nodes.length)
      const merged = mergeSnapshot(graph, snapshot, { now, radius: nextRadius, random: Math.random })
      if (!merged.changed) return
      const first = graph === null
      graph = merged.graph
      radius = nextRadius
      layout.update(merged.graph, nextRadius, { animate, first })
      for (const listener of listeners) listener()
    },
    /** Pauses the layout. Safe to call twice; a later snapshot starts it again. */
    pause() {
      layout.stop()
    },
  }
}
