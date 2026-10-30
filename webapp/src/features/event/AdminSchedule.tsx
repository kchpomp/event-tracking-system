import type { AdminTeam } from '@event-tracking-system/contracts'
import { useState } from 'react'

import { PageContainer, PageHeader } from '@/components/PageLayout'
import { Typography } from '@/components/typography'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { eventErrorMessage, scheduleErrorMessage } from './errors'
import { useAdminTeamsQuery, useScheduleQuery, useUpdateLiveMutation, useUpdateTeamScheduleMutation } from './queries'
import { isoToLocalInput, liveRequestFromValue, liveSelectValue, localInputToIso } from './schedule-model'
import { membersWord } from './model'

/** «Расписание выступлений» for administrators: one start and end per team, in the device time zone. */
export function AdminSchedule() {
  const teams = useAdminTeamsQuery()

  return (
    <PageContainer>
      <PageHeader
        description="Время выступления каждой команды. Укажите и начало, и конец, либо очистите оба. Время — по часам этого устройства."
        title="Расписание выступлений"
      />
      <LiveControl teams={teams.data?.teams ?? []} />
      {teams.isPending && <Skeleton className="h-40 w-full" />}
      {teams.isError && (
        <Alert variant="destructive">
          <AlertTitle>Не удалось загрузить команды</AlertTitle>
          <AlertDescription>{eventErrorMessage(teams.error)}</AlertDescription>
          <Button onClick={() => void teams.refetch()} type="button" variant="outline">
            Повторить
          </Button>
        </Alert>
      )}
      {teams.data?.teams.length === 0 && (
        <Empty data-testid="admin-schedule-empty">
          <EmptyHeader>
            <EmptyTitle>Команд пока нет</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}
      {teams.data && teams.data.teams.length > 0 && (
        <div className="grid gap-4" data-testid="admin-schedule-list">
          {teams.data.teams.map((team) => (
            <TeamRow key={team.id} team={team} />
          ))}
        </div>
      )}
    </PageContainer>
  )
}

/** «Сейчас выступает»: the schedule decides, nobody, or one team picked by hand. */
function LiveControl({ teams }: { teams: AdminTeam[] }) {
  const schedule = useScheduleQuery()
  const update = useUpdateLiveMutation()
  // The mutation stays pending until the schedule is refetched, so the select never flips back.
  const value = schedule.data ? liveSelectValue(schedule.data.live) : 'auto'

  return (
    <Card data-testid="admin-live">
      <CardContent className="grid gap-2">
        <label className="grid gap-1">
          <Typography tone="muted" variant="captionMedium">
            Сейчас выступает
          </Typography>
          <NativeSelect
            className="w-full max-w-sm"
            data-testid="live-select"
            disabled={!schedule.data || update.isPending}
            onChange={(event) => update.mutate(liveRequestFromValue(event.target.value))}
            value={value}
          >
            <NativeSelectOption value="auto">По расписанию</NativeSelectOption>
            <NativeSelectOption value="none">Никто</NativeSelectOption>
            {teams.map((team) => (
              <NativeSelectOption key={team.id} value={team.id}>
                {team.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        {update.isPending && (
          <Typography role="status" tone="muted" variant="bodySm">
            Сохраняем…
          </Typography>
        )}
        {update.isSuccess && (
          <Typography data-testid="live-saved" role="status" tone="primary" variant="bodySm">
            Сохранено
          </Typography>
        )}
        {schedule.isError && (
          <Typography role="alert" tone="destructive" variant="bodySm">
            Не удалось загрузить текущее значение
          </Typography>
        )}
        {update.isError && (
          <Typography data-testid="live-error" role="alert" tone="destructive" variant="bodySm">
            {scheduleErrorMessage(update.error)}
          </Typography>
        )}
      </CardContent>
    </Card>
  )
}

function TeamRow({ team }: { team: AdminTeam }) {
  const [start, setStart] = useState(isoToLocalInput(team.startsAt))
  const [end, setEnd] = useState(isoToLocalInput(team.endsAt))
  const update = useUpdateTeamScheduleMutation()

  const save = (startsAt: string | null, endsAt: string | null) =>
    update.mutate({ teamId: team.id, startsAt, endsAt })

  return (
    <Card data-testid="admin-schedule-row">
      <CardContent className="grid gap-4">
        <div className="grid gap-1">
          <Typography as="h2" variant="h6">
            {team.name}
          </Typography>
          <Typography tone="muted" variant="bodySm">
            {membersWord(team.memberCount)}
          </Typography>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1">
            <Typography tone="muted" variant="captionMedium">
              Начало
            </Typography>
            <Input
              data-testid="schedule-start"
              onChange={(event) => setStart(event.target.value)}
              type="datetime-local"
              value={start}
            />
          </label>
          <label className="grid gap-1">
            <Typography tone="muted" variant="captionMedium">
              Конец
            </Typography>
            <Input
              data-testid="schedule-end"
              onChange={(event) => setEnd(event.target.value)}
              type="datetime-local"
              value={end}
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            data-testid="schedule-save"
            disabled={update.isPending}
            onClick={() => save(localInputToIso(start), localInputToIso(end))}
            type="button"
          >
            {update.isPending ? 'Сохраняем…' : 'Сохранить'}
          </Button>
          <Button
            data-testid="schedule-clear"
            disabled={update.isPending}
            onClick={() => {
              setStart('')
              setEnd('')
              save(null, null)
            }}
            type="button"
            variant="outline"
          >
            Очистить время
          </Button>
          {update.isSuccess && (
            <Typography data-testid="schedule-saved" role="status" tone="primary" variant="bodySm">
              Сохранено
            </Typography>
          )}
        </div>
        {update.isError && (
          <Typography data-testid="schedule-error" role="alert" tone="destructive" variant="bodySm">
            {scheduleErrorMessage(update.error)}
          </Typography>
        )}
      </CardContent>
    </Card>
  )
}
