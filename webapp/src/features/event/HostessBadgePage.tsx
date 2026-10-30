import { Award01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'

import { Typography } from '@/components/typography'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { badgeIssuedMessage, hostessBadgeDialog } from './badge-model'
import { badgeErrorMessage, eventErrorMessage } from './errors'
import { tokenFrom } from './model'
import { ActivityHead, ResultDialog } from './parts'
import { QrScanner } from './QrScanner'
import { useHostessBadgeQuery, useIssueBadgeMutation, useResolveParticipantMutation } from './queries'
import { useResultDialog } from './use-result-dialog'

function Checking({ text }: { text: string }) {
  return (
    <div
      className="flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-lg bg-muted"
      role="status"
    >
      <Spinner />
      <Typography tone="muted" variant="bodySm">
        {text}
      </Typography>
    </div>
  )
}

/** Hostess: scan a participant's QR, read the badge status, issue the badge (1 point). */
export function HostessBadgePage() {
  const resolve = useResolveParticipantMutation()
  const issue = useIssueBadgeMutation()
  const dialog = useResultDialog()
  const [participantId, setParticipantId] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)
  const [round, setRound] = useState(0) // a new round mounts a new scanner, which reopens the camera
  const [issuedPoints, setIssuedPoints] = useState<number | null>(null)
  const status = useHostessBadgeQuery(participantId)

  function next() {
    issue.reset()
    setParticipantId(null)
    setResolving(false)
    setIssuedPoints(null)
    setRound((current) => current + 1)
  }

  async function handleDecoded(text: string) {
    setResolving(true)
    try {
      const { participant } = await resolve.mutateAsync({ token: tokenFrom(text) })
      setParticipantId(participant.id)
      setResolving(false)
    } catch (error) {
      dialog.show({
        variant: 'error',
        title: 'Участник не найден',
        message: eventErrorMessage(error),
        autoCloseMs: 3000,
        onClose: next,
      })
    }
  }

  async function confirm() {
    if (!participantId) return
    try {
      const result = await issue.mutateAsync(participantId)
      setIssuedPoints(result.points)
    } catch {
      // The message shows in the dialog; the hostess can retry or cancel.
    }
  }

  const view = status.data ? hostessBadgeDialog(status.data) : null

  return (
    <div className="grid gap-6">
      <ActivityHead back="/hostess" title="Выдать значок" />

      {participantId === null ? (
        resolving ? (
          <Checking text="Проверяем код…" />
        ) : (
          <>
            <QrScanner key={round} onDecoded={(text) => void handleDecoded(text)} />
            <Typography variant="emphasis">Наведите камеру на QR участника</Typography>
          </>
        )
      ) : issuedPoints !== null ? (
        <Card>
          <CardContent className="grid justify-items-start gap-4">
            <Typography
              className="flex items-center gap-2"
              data-testid="hostess-badge-done"
              tone="primary"
              variant="emphasis"
            >
              <HugeiconsIcon aria-hidden icon={Tick02Icon} strokeWidth={2.5} />
              {badgeIssuedMessage(issuedPoints)}
            </Typography>
            <Button data-testid="hostess-badge-next" onClick={next} size="lg" type="button">
              Сканировать следующего
            </Button>
          </CardContent>
        </Card>
      ) : status.isError ? (
        <Alert variant="destructive">
          <AlertDescription className="grid justify-items-start gap-3">
            <Typography as="span" variant="bodySm">
              {eventErrorMessage(status.error)}
            </Typography>
            <div className="flex gap-2">
              <Button onClick={() => void status.refetch()} type="button" variant="outline">
                Повторить
              </Button>
              <Button onClick={next} type="button" variant="outline">
                Сканировать другого
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : (
        <Checking text="Проверяем значок…" />
      )}

      <AlertDialog
        onOpenChange={(open) => {
          if (!open && !issue.isPending) next()
        }}
        open={view !== null && issuedPoints === null}
      >
        <AlertDialogContent data-testid="hostess-badge-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <HugeiconsIcon aria-hidden className="size-5 text-primary" icon={Award01Icon} strokeWidth={2} />
              {view?.title}
            </AlertDialogTitle>
            <AlertDialogDescription>{view?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          {issue.isError && (
            <Alert variant="destructive">
              <AlertDescription>{badgeErrorMessage(issue.error)}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            {view?.kind === 'eligible' ? (
              <>
                <AlertDialogCancel disabled={issue.isPending}>Отмена</AlertDialogCancel>
                <Button
                  data-testid="hostess-badge-issue"
                  disabled={issue.isPending}
                  onClick={() => void confirm()}
                  type="button"
                >
                  {issue.isPending ? 'Выдаём…' : 'Выдать значок'}
                </Button>
              </>
            ) : (
              <AlertDialogAction data-testid="hostess-badge-next-dialog">Сканировать следующего</AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ResultDialog onDismiss={dialog.dismiss} result={dialog.result} />
    </div>
  )
}
