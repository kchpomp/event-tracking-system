import { Typography } from '@/components/typography'
import { Badge } from '@/components/ui/badge'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from '@/components/ui/item'
import { ActivityHead, LoadErrorState, LoadingState } from './parts'
import { useEventMeQuery, useScheduleQuery } from './queries'
import { isLiveNow, slotLabel } from './schedule-model'
import { useServerNow } from './use-server-now'

const BADGE_TICK_MS = 15_000

/** «Расписание выступлений»: teams in the server's order, who performs now, and the own team marked. */
export function SchedulePage() {
  const query = useScheduleQuery()
  // The own team is a nicety: the page works without it.
  const myTeamId = useEventMeQuery().data?.profile.team?.id
  const now = useServerNow(
    query.data ? { serverNow: query.data.serverNow, fetchedAt: query.dataUpdatedAt } : null,
    BADGE_TICK_MS,
  )

  const head = <ActivityHead title="Расписание выступлений" />
  if (query.isPending || query.isError) {
    return (
      <div className="grid gap-6">
        {head}
        {query.isPending ? <LoadingState /> : <LoadErrorState onRetry={() => void query.refetch()} />}
      </div>
    )
  }

  const { teams, live } = query.data
  return (
    <div className="grid gap-6">
      {head}
      {teams.length === 0 ? (
        <Empty data-testid="schedule-empty">
          <EmptyHeader>
            <EmptyTitle>Расписание пока не опубликовано</EmptyTitle>
            <EmptyDescription>Время выступлений появится здесь.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ItemGroup className="gap-2" data-testid="schedule-list">
          {teams.map((team) => (
            <Item
              data-mine={team.id === myTeamId}
              data-testid="schedule-row"
              key={team.id}
              variant={team.id === myTeamId ? 'muted' : 'outline'}
            >
              <ItemContent>
                <ItemTitle>
                  {team.name}
                  {isLiveNow(team, live, now) && <Badge data-testid="schedule-now">Выступает сейчас</Badge>}
                </ItemTitle>
                {team.id === myTeamId && (
                  <Typography as="span" tone="primary" variant="caption">
                    Ваша команда
                  </Typography>
                )}
              </ItemContent>
              <ItemActions>
                <Typography className="tabular-nums" tone="muted" variant="bodySmMedium">
                  {slotLabel(team, now) ?? 'Время уточняется'}
                </Typography>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}
    </div>
  )
}
