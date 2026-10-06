import { ArrowRight01Icon, QrCodeScanIcon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  HOSTESS_SEARCH_MIN,
  POLYMER_GROUP,
  type StationSummary,
} from '@event-tracking-system/contracts'
import { useEffect, useState } from 'react'

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
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { ApiRequestError } from '@/platform/api'
import { eventErrorMessage } from './errors'
import { pointsWord, stationLabel, tokenFrom } from './model'
import { ActivityHead, LoadErrorState, LoadingState, ResultDialog, StatCard } from './parts'
import { QrScanner } from './QrScanner'
import {
  useAwardStationMutation,
  useHostessParticipantQuery,
  useHostessSearchQuery,
  useResolveParticipantMutation,
} from './queries'
import { useResultDialog } from './use-result-dialog'

const SEARCH_DEBOUNCE_MS = 300

function useDebounced(value: string) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [value])
  return debounced
}

const workplaceOf = (person: { company: string | null; city: string | null }) =>
  [person.company, person.city].filter(Boolean).join(', ')

// ---- Home: scan a participant, search by name, help someone register ----

export function HostessHomePage() {
  const [text, setText] = useState('')
  const q = useDebounced(text.trim())
  const search = useHostessSearchQuery(q)

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <Typography as="h1" variant="h4">
          Хостес
        </Typography>
        <Typography tone="muted" variant="bodySm">
          Найдите участника по QR-коду или по имени и начислите баллы за станцию, если они не засчитались.
        </Typography>
      </div>

      <Button asChild className="h-12" size="lg">
        <Link data-testid="hostess-scan" to="/hostess/scan">
          <HugeiconsIcon aria-hidden icon={QrCodeScanIcon} strokeWidth={2} />
          Сканировать QR участника
        </Link>
      </Button>

      <section className="grid gap-3">
        <Typography as="h2" variant="h6">
          Найти участника
        </Typography>
        <Field>
          <FieldLabel htmlFor="hostess-search">Имя, фамилия, город, предприятие или email</FieldLabel>
          <Input
            autoComplete="off"
            data-testid="hostess-search"
            id="hostess-search"
            onChange={(event) => setText(event.target.value)}
            value={text}
          />
        </Field>
        <SearchResults q={q} search={search} />
      </section>

      <SignupQr />
    </div>
  )
}

function SearchResults({
  q,
  search,
}: {
  q: string
  search: ReturnType<typeof useHostessSearchQuery>
}) {
  if (q.length < HOSTESS_SEARCH_MIN) {
    return (
      <Typography tone="muted" variant="bodySm">
        Введите не меньше {HOSTESS_SEARCH_MIN} символов.
      </Typography>
    )
  }
  if (search.isPending) return <Skeleton className="h-16 w-full" />
  if (search.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{eventErrorMessage(search.error)}</AlertDescription>
      </Alert>
    )
  }
  if (search.data.participants.length === 0) {
    return (
      <Typography tone="muted" variant="bodySm">
        Никого не нашли. Попробуйте другое написание или email.
      </Typography>
    )
  }
  return (
    <ItemGroup className="gap-2">
      {search.data.participants.map((person) => (
        <Item asChild key={person.id} variant="outline">
          <Link
            data-testid="hostess-result"
            params={{ participantId: person.id }}
            to="/hostess/participant/$participantId"
          >
            <ItemContent>
              <ItemTitle>{person.fullName}</ItemTitle>
              {workplaceOf(person) && <ItemDescription>{workplaceOf(person)}</ItemDescription>}
              <ItemDescription>{person.email}</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Typography className="tabular-nums" variant="bodySmMedium">
                {person.totalPoints}
              </Typography>
              <HugeiconsIcon
                aria-hidden
                className="text-muted-foreground"
                icon={ArrowRight01Icon}
                strokeWidth={2}
              />
            </ItemActions>
          </Link>
        </Item>
      ))}
    </ItemGroup>
  )
}

/** The sign-up page as a QR: the participant scans it and registers on their own phone. */
function SignupQr() {
  const [src, setSrc] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const address = `${window.location.origin}/signup`

  async function toggle() {
    if (src) {
      setSrc(null) // a second tap hides it
      return
    }
    setPending(true)
    setFailed(false)
    try {
      // Loaded on demand, like the participant's own QR.
      const { default: QRCode } = await import('qrcode')
      setSrc(await QRCode.toDataURL(address, { width: 280, margin: 2 }))
    } catch {
      setFailed(true)
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardContent className="grid gap-3">
        <Typography as="h2" variant="h6">
          Помочь с регистрацией
        </Typography>
        <Typography tone="muted" variant="bodySm">
          Покажите этот код: участник наведёт камеру телефона, и откроется страница регистрации. Поля и
          согласие на обработку данных он заполняет сам. Можно и открыть адрес в браузере его телефона.
        </Typography>
        <Typography variant="code" wrap="break">
          {address}
        </Typography>
        <Button
          data-testid="hostess-signup-qr-toggle"
          disabled={pending}
          onClick={() => void toggle()}
          size="lg"
          type="button"
          variant="secondary"
        >
          {src ? 'Скрыть QR регистрации' : pending ? 'Создаём QR…' : 'Показать QR регистрации'}
        </Button>
        {src && (
          <img
            alt="QR-код страницы регистрации"
            className="mx-auto size-64 rounded-lg bg-white"
            data-testid="hostess-signup-qr"
            src={src}
          />
        )}
        {failed && (
          <Alert variant="destructive">
            <AlertDescription>Не удалось создать QR-код. Попробуйте ещё раз.</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

// ---- Scan a participant's personal QR ----

export function HostessScanPage() {
  const navigate = useNavigate()
  const resolve = useResolveParticipantMutation()
  const dialog = useResultDialog()
  const [round, setRound] = useState(0) // a new round mounts a new scanner, which reopens the camera
  const [checking, setChecking] = useState(false)

  async function handleDecoded(text: string) {
    setChecking(true)
    try {
      const { participant } = await resolve.mutateAsync({ token: tokenFrom(text) })
      await navigate({
        to: '/hostess/participant/$participantId',
        params: { participantId: participant.id },
      })
    } catch (error) {
      dialog.show({
        variant: 'error',
        title: 'Участник не найден',
        message: eventErrorMessage(error),
        autoCloseMs: 3000,
        onClose: () => {
          setChecking(false)
          setRound((current) => current + 1)
        },
      })
    }
  }

  return (
    <div className="grid gap-6">
      <ActivityHead back="/hostess" title="QR участника" />
      {checking ? (
        <div
          className="flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-xl bg-muted"
          role="status"
        >
          <Spinner />
          <Typography variant="bodySm" tone="muted">
            Проверяем код…
          </Typography>
        </div>
      ) : (
        <QrScanner key={round} onDecoded={(text) => void handleDecoded(text)} />
      )}
      <div className="grid gap-1 text-center">
        <Typography align="center" variant="emphasis">
          Наведите камеру на QR участника
        </Typography>
        <Typography align="center" tone="muted" variant="bodySm">
          Он открывается в «Диффузия» → «Показать мой QR»
        </Typography>
      </div>
      <ResultDialog onDismiss={dialog.dismiss} result={dialog.result} />
    </div>
  )
}

// ---- One participant: their points and the stations to award ----

export function HostessParticipantPage({ participantId }: { participantId: string }) {
  const detail = useHostessParticipantQuery(participantId)
  const award = useAwardStationMutation()
  const dialog = useResultDialog()
  const [choice, setChoice] = useState<StationSummary | null>(null)

  if (detail.isPending) return <LoadingState />
  if (detail.isError) {
    if (detail.error instanceof ApiRequestError && detail.error.status === 404) {
      return (
        <div className="grid gap-6">
          <ActivityHead back="/hostess" title="Участник" />
          <Alert variant="destructive">
            <AlertDescription>Такого участника нет. Вернитесь назад и найдите его заново.</AlertDescription>
          </Alert>
        </div>
      )
    }
    return <LoadErrorState onRetry={() => void detail.refetch()} />
  }

  const { participant, stations } = detail.data
  // The Polymer game scores once for the whole group, whichever placement QR was scanned.
  const polymerDone = stations.some((s) => s.displayGroup === POLYMER_GROUP && s.visited)
  const isDone = (station: StationSummary) =>
    station.visited || (station.displayGroup === POLYMER_GROUP && polymerDone)

  async function confirm() {
    if (!choice) return
    const station = choice
    setChoice(null)
    try {
      const result = await award.mutateAsync({ participantId, stationId: station.id })
      dialog.show(
        result.alreadyCompleted
          ? {
              variant: 'warning',
              title: 'Уже засчитано',
              message: `У участника «${stationLabel(station)}» уже есть. Баллы не добавлены.`,
            }
          : {
              variant: 'success',
              title: 'Баллы начислены',
              message: `${pointsWord(result.pointsAwarded)} за «${stationLabel(station)}». Теперь у участника ${pointsWord(result.totalPoints)}.`,
              autoCloseMs: 4000,
            },
      )
    } catch (error) {
      dialog.show({
        variant: 'error',
        title: 'Не удалось начислить',
        message: eventErrorMessage(error),
      })
    }
  }

  return (
    <div className="grid gap-6">
      <ActivityHead back="/hostess" title="Участник" />
      <Card>
        <CardContent className="grid gap-1">
          <Typography as="h2" data-testid="hostess-participant-name" variant="h5">
            {participant.fullName}
          </Typography>
          <Typography tone="muted" variant="bodySm">
            {workplaceOf(participant) || 'Место работы не указано'}
          </Typography>
          <Typography tone="muted" variant="bodySm" wrap="break">
            {participant.email}
          </Typography>
        </CardContent>
      </Card>
      <StatCard label="Индекс влияния" value={String(participant.totalPoints)} />

      <section className="grid gap-3">
        <Typography as="h2" variant="h6">
          Начислить баллы за станцию
        </Typography>
        <Typography tone="muted" variant="bodySm">
          Нажмите на станцию, за которую участнику не засчитались баллы. Это то же самое, как если бы он
          сам отсканировал её QR-код.
        </Typography>
        <ItemGroup className="gap-2">
          {stations.map((station) => {
            const done = isDone(station)
            return (
              <Item asChild key={station.id} variant="outline">
                <button
                  aria-haspopup="dialog"
                  className="text-left"
                  data-testid="hostess-station"
                  disabled={done}
                  onClick={() => setChoice(station)}
                  type="button"
                >
                  <ItemContent>
                    <ItemTitle>{stationLabel(station)}</ItemTitle>
                    {done && (
                      <Typography
                        as="span"
                        className="flex items-center gap-1"
                        tone="primary"
                        variant="caption"
                      >
                        <HugeiconsIcon aria-hidden className="size-3" icon={Tick02Icon} strokeWidth={2.5} />
                        Уже есть
                      </Typography>
                    )}
                  </ItemContent>
                  <ItemActions>
                    <Typography className="tabular-nums" variant="bodySmMedium">
                      {station.points}
                    </Typography>
                  </ItemActions>
                </button>
              </Item>
            )
          })}
        </ItemGroup>
      </section>

      <AlertDialog onOpenChange={(open) => !open && setChoice(null)} open={choice !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Начислить баллы?</AlertDialogTitle>
            <AlertDialogDescription>
              {choice
                ? `${participant.fullName}: ${pointsWord(choice.points)} за «${stationLabel(choice)}».`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction data-testid="hostess-award-confirm" onClick={() => void confirm()}>
              Начислить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ResultDialog onDismiss={dialog.dismiss} result={dialog.result} />
    </div>
  )
}
