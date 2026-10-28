import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { Typography } from '@/components/typography'
import { Spinner } from '@/components/ui/spinner'
import { useAuth } from '@/features/auth'
import { useMediaQuery } from '@/hooks/use-media-query'
import { cn } from '@/lib/utils'
import { formatTime } from '@/platform/intl'
import { createNetworkEngine } from './engine'
import {
  degreeTier,
  freshKeys,
  nextFreshExpiry,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  type DegreeTier,
  type ScreenNode,
} from './model'
import { useNetworkQuery } from './queries'

// Variant D, «Вес связей»: the circle's colour says how far the person is with «Диффузия».
const tierStyles: Record<DegreeTier, { circle: string; text: string }> = {
  none: { circle: 'fill-background stroke-border', text: 'fill-muted-foreground' },
  some: { circle: 'fill-secondary stroke-brand', text: 'fill-foreground' },
  goal: { circle: 'fill-primary stroke-primary', text: 'fill-primary-foreground' },
}

const translate = (node: Pick<ScreenNode, 'x' | 'y'>) => `translate(${node.x.toFixed(1)} ${node.y.toFixed(1)})`

/**
 * «Сеть знакомств» for the big display at the venue: every participant is a circle with initials,
 * every connection a line. Only circles and lines: no names, counters or hints. It polls the
 * server, keeps the last picture through network errors and a lost session, and marks both in a
 * small corner label that is invisible from the room.
 */
export function NetworkScreen() {
  const auth = useAuth()
  const signedIn = auth.user?.role === 'admin'
  const query = useNetworkQuery()
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [engine] = useState(createNetworkEngine)
  const graph = useSyncExternalStore(engine.subscribe, engine.graph, engine.graph)
  const nodeElements = useRef(new Map<string, SVGGElement>())
  const edgeElements = useRef(new Map<string, SVGLineElement>())
  // Moves forward only when an accent is due to fade; until then new arrivals count as fresh.
  const [clock, setClock] = useState(0)

  // Registered before the first snapshot is taken in: the layout ticks move the SVG directly.
  useEffect(() => {
    engine.onDraw(() => {
      const current = engine.graph()
      if (!current) return
      const byId = new Map(current.nodes.map((node) => [node.id, node]))
      for (const node of current.nodes) {
        nodeElements.current.get(node.id)?.setAttribute('transform', translate(node))
      }
      for (const edge of current.edges) {
        const line = edgeElements.current.get(edge.key)
        const a = byId.get(edge.a)
        const b = byId.get(edge.b)
        if (!line || !a || !b) continue
        line.setAttribute('x1', a.x.toFixed(1))
        line.setAttribute('y1', a.y.toFixed(1))
        line.setAttribute('x2', b.x.toFixed(1))
        line.setAttribute('y2', b.y.toFixed(1))
      }
    })
    return () => {
      engine.onDraw(null)
      engine.pause()
    }
  }, [engine])

  useEffect(() => {
    if (query.data) engine.ingest(query.data, { animate: !reducedMotion, now: Date.now() })
  }, [engine, query.data, reducedMotion])

  useEffect(() => {
    if (!graph) return
    const wait = nextFreshExpiry(graph, Date.now())
    if (wait === null) return
    const timer = window.setTimeout(() => setClock(Date.now()), wait + 50)
    return () => window.clearTimeout(timer)
  }, [graph, clock])

  const radius = engine.radius()
  const fresh = graph ? freshKeys(graph, clock) : null
  const byId = new Map(graph?.nodes.map((node) => [node.id, node]))
  const status = !signedIn ? 'session' : query.isError ? 'offline' : null

  return (
    <div className="fixed inset-0 overflow-hidden bg-background" data-testid="network-screen">
      <svg
        aria-label="Сеть знакомств участников"
        className="size-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        viewBox={`0 0 ${SCREEN_WIDTH} ${SCREEN_HEIGHT}`}
      >
        <g>
          {graph?.edges.map((edge) => {
            const a = byId.get(edge.a)
            const b = byId.get(edge.b)
            if (!a || !b) return null
            const isFresh = fresh?.edges.has(edge.key) ?? false
            return (
              <line
                className={cn('transition-colors duration-150', isFresh ? 'stroke-highlight' : 'stroke-chart-1/40')}
                key={edge.key}
                ref={(element) => {
                  if (element) edgeElements.current.set(edge.key, element)
                  else edgeElements.current.delete(edge.key)
                }}
                strokeLinecap="round"
                strokeWidth={isFresh ? 4 : 2}
                x1={a.x.toFixed(1)}
                x2={b.x.toFixed(1)}
                y1={a.y.toFixed(1)}
                y2={b.y.toFixed(1)}
              />
            )
          })}
        </g>
        <g>
          {graph?.nodes.map((node) => {
            const tier = tierStyles[degreeTier(node.degree)]
            const isFresh = fresh?.nodes.has(node.id) ?? false
            return (
              <g
                data-testid="network-node"
                key={node.id}
                ref={(element) => {
                  if (element) nodeElements.current.set(node.id, element)
                  else nodeElements.current.delete(node.id)
                }}
                transform={translate(node)}
              >
                {isFresh && <circle className="fill-highlight/25" r={radius + 8} />}
                <circle
                  className={cn('transition-colors duration-150', tier.circle, isFresh && 'stroke-highlight')}
                  r={radius}
                  strokeWidth={isFresh ? 3 : 2}
                />
                <text
                  className={tier.text}
                  dominantBaseline="central"
                  fontSize={Math.round(radius * 0.74)}
                  fontWeight={700}
                  textAnchor="middle"
                >
                  {node.initials}
                </text>
              </g>
            )
          })}
        </g>
      </svg>

      {graph === null && status === null && (
        <div className="absolute inset-0 grid place-items-center">
          <Spinner className="size-8 text-muted-foreground" />
        </div>
      )}
      {graph !== null && graph.nodes.length === 0 && (
        <div className="absolute inset-0 grid place-items-center" data-testid="network-empty">
          <Typography tone="muted" variant="h3">
            Сеть знакомств появится здесь
          </Typography>
        </div>
      )}
      {status && (
        <div
          className="absolute right-4 bottom-4 flex items-center gap-2 rounded-md bg-background/80 px-3 py-2"
          data-testid="network-status"
          role="status"
        >
          <span aria-hidden className="size-2 rounded-full border-2 border-muted-foreground" />
          {status === 'session' ? (
            <Typography asChild tone="muted" variant="caption">
              <Link search={{ returnTo: '/admin/network' }} to="/login">
                Сессия истекла · войти снова
              </Link>
            </Typography>
          ) : (
            <Typography tone="muted" variant="caption">
              {query.dataUpdatedAt
                ? `Нет связи · данные на ${formatTime(query.dataUpdatedAt)}`
                : 'Нет связи с сервером'}
            </Typography>
          )}
        </div>
      )}
    </div>
  )
}
