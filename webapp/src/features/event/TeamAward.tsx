import { TEAM_AWARD_MAX_POINTS, TEAM_AWARD_MIN_POINTS, type TeamSummary } from '@event-tracking-system/contracts'
import { useState } from 'react'

import { Typography } from '@/components/typography'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { teamAwardErrorMessage } from './errors'
import { membersWord, parseTeamPoints, pointsWord, teamAwardResult } from './model'
import { ResultDialog } from './parts'
import { useAwardTeamMutation, useHostessTeamsQuery } from './queries'
import { useResultDialog } from './use-result-dialog'

/** One open confirmation. The key is made when it opens and kept for every retry inside it. */
type Pending = { team: TeamSummary; points: number; awardKey: string }

/** Hostess home: the same points for every member of a team, once per confirmed dialog. */
export function TeamAward() {
  const teams = useHostessTeamsQuery()
  const award = useAwardTeamMutation()
  const result = useResultDialog()
  const [teamId, setTeamId] = useState('')
  const [pointsText, setPointsText] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)

  const team = teams.data?.teams.find((candidate) => candidate.id === teamId)
  const points = parseTeamPoints(pointsText)

  function open() {
    if (!team || points === null) return
    award.reset()
    setPending({ team, points, awardKey: crypto.randomUUID() })
  }

  function close() {
    if (award.isPending) return
    setPending(null)
  }

  function confirm() {
    if (!pending) return
    award.mutate(
      { teamId: pending.team.id, points: pending.points, awardKey: pending.awardKey },
      {
        onSuccess: (response) => {
          setPending(null)
          result.show(teamAwardResult(response))
        },
      },
    )
  }

  return (
    <Card>
      <CardContent className="grid gap-3" data-testid="team-award">
        <Typography as="h2" variant="h6">
          Баллы всей команде
        </Typography>
        <Typography tone="muted" variant="bodySm">
          Каждый участник выбранной команды получит указанные баллы. Начисление действует один раз за
          подтверждение.
        </Typography>
        {teams.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : teams.isError ? (
          <Alert variant="destructive">
            <AlertDescription className="grid justify-items-start gap-3">
              <Typography as="span" variant="bodySm">
                {teamAwardErrorMessage(teams.error)}
              </Typography>
              <Button onClick={() => void teams.refetch()} size="lg" type="button" variant="outline">
                Повторить
              </Button>
            </AlertDescription>
          </Alert>
        ) : teams.data.teams.length === 0 ? (
          <Typography data-testid="team-award-empty" tone="muted" variant="bodySm">
            Команд пока нет: начислять некому.
          </Typography>
        ) : (
          <>
            <Field>
              <FieldLabel htmlFor="team-award-team">Команда</FieldLabel>
              <NativeSelect
                className="w-full"
                data-testid="team-award-team"
                id="team-award-team"
                onChange={(event) => setTeamId(event.target.value)}
                value={teamId}
              >
                <NativeSelectOption value="">Выберите команду</NativeSelectOption>
                {teams.data.teams.map((item) => (
                  <NativeSelectOption key={item.id} value={item.id}>
                    {item.name} ({membersWord(item.memberCount)})
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="team-award-points">
                Баллы каждому: от {TEAM_AWARD_MIN_POINTS} до {TEAM_AWARD_MAX_POINTS}
              </FieldLabel>
              <Input
                data-testid="team-award-points"
                id="team-award-points"
                inputMode="numeric"
                onChange={(event) => setPointsText(event.target.value)}
                value={pointsText}
              />
            </Field>
            <Button
              data-testid="team-award-open"
              disabled={!team || points === null}
              onClick={open}
              size="lg"
              type="button"
            >
              Начислить команде
            </Button>
          </>
        )}
      </CardContent>

      <AlertDialog onOpenChange={(isOpen) => !isOpen && close()} open={pending !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Начислить баллы команде?</AlertDialogTitle>
            <AlertDialogDescription data-testid="team-award-summary">
              {pending
                ? `Команда «${pending.team.name}», ${membersWord(pending.team.memberCount)}: каждому ${pointsWord(pending.points)}.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {award.isError && (
            <Typography data-testid="team-award-error" role="alert" tone="destructive" variant="bodyXs">
              {teamAwardErrorMessage(award.error)}
            </Typography>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={award.isPending}>Отмена</AlertDialogCancel>
            <Button data-testid="team-award-confirm" disabled={award.isPending} onClick={confirm} type="button">
              {award.isPending ? 'Начисляем…' : award.isError ? 'Повторить' : 'Начислить'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ResultDialog onDismiss={result.dismiss} result={result.result} />
    </Card>
  )
}
