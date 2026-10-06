import {
  ArrowRight01Icon,
  QrCodeScanIcon,
  Tick02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { DIFFUSION_GOAL, IDEA_GOAL, type LeaderboardEntry } from '@event-tracking-system/contracts'
import type { ReactNode } from 'react'

import { Typography } from '@/components/typography'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Item, ItemActions, ItemContent, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { ActivityIcon, PolymerChain, StationIcon } from './icons'
import {
  activityProgress,
  fullName,
  isPolymerCard,
  pointsLabel,
  START_STATION,
  toStationCards,
  type StationCard,
} from './model'
import { LoadErrorState, LoadingState } from './parts'
import { useEventMeQuery, useLeaderboardQuery, useStationsQuery } from './queries'

const BOARD_SIZE = 10

export function EventDashboard() {
  const me = useEventMeQuery()
  const stations = useStationsQuery()
  const board = useLeaderboardQuery()

  if (me.isPending || stations.isPending) return <LoadingState />
  if (me.isError || stations.isError) {
    return (
      <LoadErrorState
        onRetry={() => {
          void me.refetch()
          void stations.refetch()
        }}
      />
    )
  }

  const { profile, progress: totals } = me.data
  const cards = toStationCards(stations.data.stations)
  const progress = activityProgress(cards, totals.ideasCount, totals.connectionsCount)
  const start = cards.filter((card) => card.name === START_STATION)
  const others = cards.filter((card) => card.name !== START_STATION)

  return (
    <div className="grid gap-6">
      <Card>
        <CardContent className="grid gap-3">
          <div className="grid gap-1">
            <Typography tone="muted" variant="captionMedium">
              Ваш текущий прогресс,
            </Typography>
            <Typography as="h1" variant="h4">
              {fullName(profile)}:
            </Typography>
            <Typography tone="muted" variant="captionMedium">
              Индекс влияния
            </Typography>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Typography as="p" className="lining-nums tabular-nums" data-testid="total-points" variant="h2">
              {totals.totalPoints}
            </Typography>
            <Badge data-testid="progress-percent" variant="secondary">
              {progress.percent}%
            </Badge>
          </div>
          <Progress aria-label="Пройдено активностей" value={progress.percent} />
          <Typography tone="muted" variant="bodyXs">
            Пройдено активностей: {progress.doneActivities} из {progress.totalActivities}
          </Typography>
        </CardContent>
      </Card>

      <Button asChild className="h-12" size="lg">
        <Link data-testid="scan-button" to="/app/scan">
          <HugeiconsIcon aria-hidden icon={QrCodeScanIcon} strokeWidth={2} />
          Сканировать QR‑код
        </Link>
      </Button>

      <Section title="Активности">
        <ItemGroup className="gap-2">
          {start.map((card) => (
            <StationRow card={card} key={card.id} />
          ))}
          <Item asChild variant="outline">
            <Link to="/app/diffusion">
              <ActivityBody
                done={progress.links >= DIFFUSION_GOAL}
                doneLabel="Пройдено"
                icon={<ActivityIcon kind="diffusion" />}
                name="Диффузия"
                right={`${progress.links} из ${DIFFUSION_GOAL}`}
              />
            </Link>
          </Item>
          <Item asChild variant="outline">
            <Link to="/app/ideas">
              <ActivityBody
                done={progress.ideas >= IDEA_GOAL}
                doneLabel="Пройдено"
                icon={<ActivityIcon kind="ideas" />}
                name="Колба идей"
                right={`${progress.ideas} из ${IDEA_GOAL}`}
              />
            </Link>
          </Item>
          {others.map((card) => (
            <StationRow card={card} key={card.id} />
          ))}
        </ItemGroup>
      </Section>

      <Section title="Рейтинг участников">
        {board.isError ? (
          <Alert variant="destructive">
            <AlertDescription>
              Не удалось загрузить рейтинг участников. Попробуйте обновить страницу.
            </AlertDescription>
          </Alert>
        ) : (
          <Leaderboard entries={board.data?.entries ?? []} pending={board.isPending} />
        )}
      </Section>
    </div>
  )
}

function Section({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="grid gap-3">
      <Typography as="h2" variant="h6">
        {title}
      </Typography>
      {children}
    </section>
  )
}

function StationRow({ card }: { card: StationCard }) {
  const polymer = isPolymerCard(card)
  const body = (
    <ActivityBody
      done={card.done}
      doneLabel="Посещено"
      icon={polymer ? <PolymerChain /> : <StationIcon name={card.name} />}
      name={card.name}
      right={pointsLabel(card.points)}
    />
  )
  return (
    <Item asChild variant="outline">
      {polymer ? (
        <Link to="/app/polymer">{body}</Link>
      ) : (
        <Link params={{ stationId: card.id }} to="/app/station/$stationId">
          {body}
        </Link>
      )}
    </Item>
  )
}

/** One card of the list: the whole card is the link, with its icon, state and points or progress. */
function ActivityBody({
  done,
  doneLabel,
  icon,
  name,
  right,
}: {
  done: boolean
  doneLabel: string
  icon: ReactNode
  name: string
  right: string
}) {
  return (
    <>
      <ItemMedia variant="icon">{icon}</ItemMedia>
      <ItemContent>
        <ItemTitle>{name}</ItemTitle>
        {done && (
          <Typography as="span" className="flex items-center gap-1" tone="primary" variant="caption">
            <HugeiconsIcon aria-hidden className="size-3" icon={Tick02Icon} strokeWidth={2.5} />
            {doneLabel}
          </Typography>
        )}
      </ItemContent>
      <ItemActions>
        <Typography className="tabular-nums" variant="bodySmMedium">
          {right}
        </Typography>
        <HugeiconsIcon aria-hidden className="text-muted-foreground" icon={ArrowRight01Icon} strokeWidth={2} />
      </ItemActions>
    </>
  )
}

function Leaderboard({ entries, pending }: { entries: LeaderboardEntry[]; pending: boolean }) {
  if (pending) return <LoadingState />
  const best = entries[0]?.totalPoints || 1
  // An 11th row exists only when the caller is outside the top 10: it goes below a gap.
  const top = entries.slice(0, BOARD_SIZE)
  const outside = entries[BOARD_SIZE]

  // The index is part of the key: tied participants with the same name share rank and name.
  const row = (entry: LeaderboardEntry, index: number) => (
    <li className="flex items-center gap-3" data-testid="board-row" key={`${index}-${entry.rank}-${entry.isMe}`}>
      <Typography align="center" className="w-7 shrink-0 tabular-nums" tone="muted" variant="bodySmMedium">
        {entry.rank}
      </Typography>
      <div className="grid min-w-0 flex-1 gap-1.5">
        <Typography truncate variant={entry.isMe ? 'bodySmMedium' : 'bodySm'}>
          {entry.fullName}
          {entry.isMe ? ' (вы)' : ''}
        </Typography>
        <Progress aria-hidden value={Math.round((entry.totalPoints / best) * 100)} />
      </div>
      <Typography className="shrink-0 tabular-nums" variant="bodySmMedium">
        {entry.totalPoints}
        <Typography as="span" tone="muted" variant="bodyXs">
          {' '}
          оч
        </Typography>
      </Typography>
    </li>
  )

  return (
    <Card>
      <CardContent>
        <ol className="grid gap-4">
          {top.map(row)}
          {outside && (
            <>
              <li aria-hidden>
                <Separator />
              </li>
              {row(outside, top.length)}
            </>
          )}
        </ol>
      </CardContent>
    </Card>
  )
}
