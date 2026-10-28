import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Force,
  type SimulationLinkDatum,
} from 'd3-force'

import { SCREEN_HEIGHT, SCREEN_WIDTH, type ScreenGraph, type ScreenNode } from './model'

/** Empty space kept along the screen edges, besides the circle itself. */
const EDGE_MARGIN = 40
const VELOCITY_DECAY = 0.4
/** Enough ticks to cool from alpha 1 to d3's alphaMin with the default alpha decay. */
const SETTLE_TICKS = 300
/** Ticks to absorb a snapshot without animation (reduced motion). */
const ABSORB_TICKS = 80
/** How hot a new snapshot makes the layout: enough for newcomers to find a place, not to reshuffle. */
const REHEAT_ALPHA = 0.1

type Link = SimulationLinkDatum<ScreenNode>

/** Keeps every circle inside the screen by trimming the velocity that would carry it out. */
function boundsForce(radius: number): Force<ScreenNode, Link> {
  let nodes: ScreenNode[] = []
  const keep = (position: number, velocity: number, low: number, high: number) => {
    // d3 moves a node by velocity × (1 − decay) right after the forces run.
    const next = position + velocity * (1 - VELOCITY_DECAY)
    if (next < low) return (low - position) / (1 - VELOCITY_DECAY)
    if (next > high) return (high - position) / (1 - VELOCITY_DECAY)
    return velocity
  }
  const force: Force<ScreenNode, Link> = () => {
    const inset = EDGE_MARGIN + radius
    for (const node of nodes) {
      node.vx = keep(node.x, node.vx, inset, SCREEN_WIDTH - inset)
      node.vy = keep(node.y, node.vy, inset, SCREEN_HEIGHT - inset)
    }
  }
  force.initialize = (next) => {
    nodes = next
  }
  return force
}

/**
 * The force layout: repulsion, collision with a gap, links pulling acquaintances together, and a
 * soft pull to the centre that is weaker sideways, so the crowd fills a 16:9 screen. d3 moves the
 * node objects of the graph it was given; the screen reads their x and y on every tick.
 */
export function createScreenLayout(onTick: () => void) {
  const simulation = forceSimulation<ScreenNode, Link>([])
    .stop()
    .velocityDecay(VELOCITY_DECAY)
    .on('tick', onTick)

  return {
    /**
     * Takes a merged graph. `animate: false` settles synchronously and draws once: the first
     * snapshot (no explosion on screen) and every snapshot under reduced motion.
     */
    update(graph: ScreenGraph, radius: number, { animate, first }: { animate: boolean; first: boolean }) {
      simulation
        .nodes(graph.nodes)
        .force('charge', forceManyBody<ScreenNode>().strength(-10 * radius).distanceMax(300))
        .force(
          'link',
          forceLink<ScreenNode, Link>(graph.edges.map((edge) => ({ source: edge.a, target: edge.b })))
            .id((node) => node.id)
            .distance(2 * radius + 34)
            .strength(0.22),
        )
        .force('collide', forceCollide<ScreenNode>(radius + 6).iterations(2))
        .force('x', forceX<ScreenNode>(SCREEN_WIDTH / 2).strength(0.0035))
        .force('y', forceY<ScreenNode>(SCREEN_HEIGHT / 2).strength(0.016))
        .force('bounds', boundsForce(radius))

      simulation.alpha(first ? 1 : Math.max(simulation.alpha(), REHEAT_ALPHA))
      if (animate && !first) {
        simulation.restart()
        return
      }
      simulation.stop()
      simulation.tick(first ? SETTLE_TICKS : ABSORB_TICKS)
      onTick()
    },
    stop() {
      simulation.stop()
    },
  }
}
