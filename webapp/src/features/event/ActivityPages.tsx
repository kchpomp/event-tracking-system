import { QrCodeScanIcon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link, Navigate, useNavigate } from '@tanstack/react-router'
import { DIFFUSION_GOAL, IDEA_GOAL, POLYMER_GROUP } from '@event-tracking-system/contracts'
import { useState, type ReactNode } from 'react'

import { Typography } from '@/components/typography'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from '@/components/ui/item'
import { Textarea } from '@/components/ui/textarea'
import {
  DIFFUSION_COPY,
  DIFFUSION_TASK_QUESTIONS,
  DIFFUSION_TASKS,
  IDEAS_COPY,
  POLYMER,
  STATION_COPY,
  STATION_DEFAULT,
} from './content'
import { eventErrorMessage, GENERIC_ERROR } from './errors'
import { ActivityIcon, PolymerChain, StationIcon } from './icons'
import { hasOwnScanButton } from './model'
import {
  ActivityHead,
  LoadErrorState,
  LoadingState,
  MiniChain,
  ResultDialog,
  StatCard,
} from './parts'
import { useResultDialog } from './use-result-dialog'
import {
  useCreateIdeaMutation,
  useEventMeQuery,
  useStationsQuery,
} from './queries'

function ScanButton({ label, to }: { label: string; to: '/app/scan' | '/app/diffusion/scan' }) {
  return (
    <Button asChild className="h-12" size="lg">
      <Link to={to}>
        <HugeiconsIcon aria-hidden icon={QrCodeScanIcon} strokeWidth={2} />
        {label}
      </Link>
    </Button>
  )
}

function CopyCard({ headline, paragraphs }: { headline: string; paragraphs: readonly string[] }) {
  return (
    <Card>
      <CardContent className="grid gap-3">
        <Typography as="h2" variant="h5">
          {headline}
        </Typography>
        {paragraphs.map((text) => (
          <Typography key={text} tone="muted" variant="bodySm">
            {text}
          </Typography>
        ))}
      </CardContent>
    </Card>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Typography as="h2" variant="h6">
      {children}
    </Typography>
  )
}

// ---- A plain station: points for scanning its QR ----

export function StationPage({ stationId }: { stationId: string }) {
  const stations = useStationsQuery()
  if (stations.isPending) return <LoadingState />
  if (stations.isError) return <LoadErrorState onRetry={() => void stations.refetch()} />

  const station = stations.data.stations.find((candidate) => candidate.id === stationId)
  // An unknown, inactive or malformed id just goes back to the list.
  if (!station) return <Navigate replace to="/app" />

  const copy = STATION_COPY[station.name] ?? STATION_DEFAULT
  return (
    <div className="grid gap-6">
      <ActivityHead icon={<StationIcon name={station.name} />} title={station.name} />
      <StatCard
        label="Баллы за станцию"
        side={station.visited ? <Badge>Посещено</Badge> : null}
        value={`${station.points}`}
      />
      <CopyCard headline={copy.headline} paragraphs={copy.paragraphs} />
      {hasOwnScanButton(station.name) && <ScanButton label="Сканировать QR-код" to="/app/scan" />}
    </div>
  )
}

// ---- «Диффузия» ----

export function DiffusionPage() {
  const me = useEventMeQuery()
  const [questionsFor, setQuestionsFor] = useState<number | null>(null)
  const [qr, setQr] = useState<{ src: string } | { error: true } | null>(null)
  const [qrPending, setQrPending] = useState(false)

  if (me.isPending) return <LoadingState />
  if (me.isError) return <LoadErrorState onRetry={() => void me.refetch()} />

  const count = Math.min(me.data.progress.connectionsCount, DIFFUSION_GOAL)
  const complete = count >= DIFFUSION_GOAL

  async function toggleQr() {
    if (qr) {
      setQr(null) // a second tap hides it
      return
    }
    setQrPending(true)
    try {
      // Loaded on demand: the QR generator is not needed anywhere else.
      const { default: QRCode } = await import('qrcode')
      setQr({ src: await QRCode.toDataURL(me.data!.profile.personalQrToken, { width: 280, margin: 2 }) })
    } catch {
      setQr({ error: true })
    } finally {
      setQrPending(false)
    }
  }

  return (
    <div className="grid gap-6">
      <ActivityHead icon={<ActivityIcon kind="diffusion" />} title="Диффузия" />
      <StatCard
        label="Связей"
        side={<MiniChain goal={DIFFUSION_GOAL} n={count} />}
        value={`${count} из ${DIFFUSION_GOAL}`}
      />
      <CopyCard headline={DIFFUSION_COPY.headline} paragraphs={DIFFUSION_COPY.paragraphs} />

      <section className="grid gap-3">
        <SectionTitle>{DIFFUSION_COPY.tasksTitle}</SectionTitle>
        <ItemGroup className="gap-2">
          {DIFFUSION_TASKS.map((task, index) => (
            <Item asChild key={task} variant="outline">
              <button
                aria-haspopup="dialog"
                className="text-left"
                onClick={() => setQuestionsFor(index)}
                type="button"
              >
                <ItemContent>
                  <ItemTitle>{task}</ItemTitle>
                </ItemContent>
                <ItemActions>
                  {index < count && (
                    <>
                      <HugeiconsIcon aria-hidden className="text-primary" icon={Tick02Icon} strokeWidth={2.5} />
                      <Typography variant="srOnly">Готово</Typography>
                    </>
                  )}
                </ItemActions>
              </button>
            </Item>
          ))}
        </ItemGroup>
      </section>

      {complete ? (
        <Typography tone="primary" variant="bodySmMedium">
          Диффузия завершена. Вы создали 3 новых профессиональных связи.
        </Typography>
      ) : (
        <ScanButton label="Сканировать QR участника" to="/app/diffusion/scan" />
      )}

      <Button disabled={qrPending} onClick={() => void toggleQr()} size="lg" type="button" variant="secondary">
        {qrPending ? 'Создаём QR…' : 'Показать мой QR'}
      </Button>
      {qr && 'src' in qr && (
        <Card>
          <CardContent className="grid justify-items-center gap-3">
            <img alt="Мой QR-код" className="size-64 rounded-lg bg-white" data-testid="my-qr" src={qr.src} />
            <Typography align="center" tone="muted" variant="bodySm">
              Покажите этот код участнику, с которым познакомились.
            </Typography>
          </CardContent>
        </Card>
      )}
      {qr && 'error' in qr && (
        <Alert variant="destructive">
          <AlertDescription>Не удалось создать QR-код. Попробуйте ещё раз.</AlertDescription>
        </Alert>
      )}

      <Dialog onOpenChange={(open) => !open && setQuestionsFor(null)} open={questionsFor !== null}>
        <DialogContent>
          {questionsFor !== null && (
            <>
              <DialogHeader>
                <DialogTitle>{DIFFUSION_TASKS[questionsFor]}</DialogTitle>
                <DialogDescription>Вопросы для обсуждения</DialogDescription>
              </DialogHeader>
              <ol className="grid gap-3">
                {DIFFUSION_TASK_QUESTIONS[questionsFor]!.map((question, index) => (
                  <li className="relative pl-8" key={question}>
                    <Typography
                      aria-hidden
                      as="span"
                      className="absolute top-0 left-0 grid size-5 place-items-center rounded-sm border-[1.5px] border-primary text-primary"
                      variant="captionMedium"
                    >
                      {index + 1}
                    </Typography>
                    <Typography variant="bodySm">{question}</Typography>
                  </li>
                ))}
              </ol>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---- «Колба идей» ----

const IDEA_FIELDS = [
  // [key, label, long text?, max length]: the limits are the contract's own
  ['title', 'Название идеи', false, 200],
  ['direction', 'Направление идеи', false, 200],
  ['problem', 'Какую проблему или задачу она решает', true, 5000],
  ['description', 'Описание', true, 5000],
  ['expectedResult', 'Ожидаемый результат или эффект от внедрения', true, 5000],
] as const

type IdeaDraft = Record<(typeof IDEA_FIELDS)[number][0], string>
const EMPTY_IDEA: IdeaDraft = { title: '', direction: '', problem: '', description: '', expectedResult: '' }

export function IdeasPage() {
  const me = useEventMeQuery()
  const createIdea = useCreateIdeaMutation()
  const navigate = useNavigate()
  const dialog = useResultDialog()
  const [draft, setDraft] = useState<IdeaDraft>(EMPTY_IDEA)
  const [error, setError] = useState<string | null>(null)

  if (me.isPending) return <LoadingState />
  if (me.isError) return <LoadErrorState onRetry={() => void me.refetch()} />

  const count = Math.min(me.data.progress.ideasCount, IDEA_GOAL)
  const filled = Object.values(draft).every((value) => value.trim() !== '')

  async function submit() {
    if (!filled) return
    setError(null)
    try {
      await createIdea.mutateAsync(draft)
      setDraft(EMPTY_IDEA) // the button stays disabled (fields are empty): no idea is sent twice
      dialog.show({
        variant: 'success',
        title: 'Идея отправлена',
        message: 'Идея принята и добавлена в Банк идей.',
        autoCloseMs: 3000,
        onClose: () => void navigate({ to: '/app' }),
      })
    } catch (caught) {
      // Keep the person's text: only the message changes.
      const message = eventErrorMessage(caught)
      setError(message === GENERIC_ERROR ? 'Не удалось отправить идею. Попробуйте ещё раз.' : message)
    }
  }

  return (
    <div className="grid gap-6">
      <ActivityHead icon={<ActivityIcon kind="ideas" />} title="Колба идей" />
      <StatCard
        label="Идей"
        side={<MiniChain goal={IDEA_GOAL} n={count} />}
        value={`${count} из ${IDEA_GOAL}`}
      />
      <CopyCard headline={IDEAS_COPY.headline} paragraphs={IDEAS_COPY.paragraphs} />

      <Card>
        <CardContent>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <FieldGroup>
              {IDEA_FIELDS.map(([key, label, long, max]) => (
                <Field key={key}>
                  <FieldLabel htmlFor={`idea-${key}`}>{label}</FieldLabel>
                  {long ? (
                    <Textarea
                      id={`idea-${key}`}
                      maxLength={max}
                      onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
                      rows={4}
                      value={draft[key]}
                    />
                  ) : (
                    <Input
                      id={`idea-${key}`}
                      maxLength={max}
                      onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
                      value={draft[key]}
                    />
                  )}
                </Field>
              ))}
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Button
                className="h-12"
                data-testid="idea-submit"
                disabled={!filled || createIdea.isPending}
                size="lg"
                type="submit"
              >
                {createIdea.isPending ? 'Отправка…' : 'Отправить идею'}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
      <ResultDialog onDismiss={dialog.dismiss} result={dialog.result} />
    </div>
  )
}

// ---- «Полимер решений» ----

export function PolymerPage() {
  const stations = useStationsQuery()
  if (stations.isPending) return <LoadingState />
  if (stations.isError) return <LoadErrorState onRetry={() => void stations.refetch()} />

  // The people running the game hand each participant ONE placement QR (10 points for 1st place
  // ... 1 for 10th). A participant earns from the game once, whichever QR they scan.
  const group = stations.data.stations.filter((station) => station.displayGroup === POLYMER_GROUP)
  const done = group.find((station) => station.visited)
  const best = Math.max(0, ...group.map((station) => station.points))

  return (
    <div className="grid gap-6">
      <ActivityHead icon={<PolymerChain />} title="Полимер решений" />
      <StatCard
        label="Баллы за игру"
        side={done ? <Badge>Пройдено</Badge> : null}
        value={done ? `${done.points}` : `до ${best}`}
      />
      {/* A flat panel with one pattern figure (a quarter circle, as in the partnership cells). */}
      <section className="relative overflow-hidden rounded-lg bg-primary px-6 py-7">
        <svg
          aria-hidden
          className="absolute top-0 right-0 h-full text-primary-foreground/15"
          preserveAspectRatio="xMaxYMid slice"
          viewBox="0 0 100 100"
        >
          <path d="M100 100V12A88 88 0 0 0 12 100Z" fill="currentColor" />
        </svg>
        <Typography as="h2" className="relative text-primary-foreground" variant="h5">
          {POLYMER.lead}
        </Typography>
      </section>
      <Typography tone="muted" variant="bodySm">
        {POLYMER.intro}
      </Typography>

      <section className="grid gap-4">
        <SectionTitle>{POLYMER.stepsTitle}</SectionTitle>
        {/* A chain: numbered nodes joined by a thin line, the duration as a square tag beside each title. */}
        <ol className="grid">
          {POLYMER.steps.map(([title, time, text], index) => (
            <li className="relative pb-5 pl-9 last:pb-0" key={title}>
              <Typography
                aria-hidden
                as="span"
                className="absolute top-0 left-0 z-10 grid size-6 place-items-center rounded-sm border-[1.5px] border-primary bg-card text-primary"
                variant="captionMedium"
              >
                {index + 1}
              </Typography>
              {index < POLYMER.steps.length - 1 && (
                <span aria-hidden className="absolute top-6 bottom-0 left-3 w-px -translate-x-1/2 bg-primary/40" />
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Typography variant="bodySmMedium">{title}</Typography>
                <Typography
                  as="span"
                  className="rounded-sm border border-border px-2 py-0.5 text-primary"
                  variant="captionMedium"
                  wrap="nowrap"
                >
                  {time}
                </Typography>
              </div>
              <Typography className="mt-1" tone="muted" variant="bodySm">
                {text}
              </Typography>
            </li>
          ))}
        </ol>
      </section>

      <Card>
        <CardContent className="grid gap-3">
          <SectionTitle>{POLYMER.seeTitle}</SectionTitle>
          {POLYMER.see.map((text) => (
            <Typography key={text} tone="muted" variant="bodySm">
              {text}
            </Typography>
          ))}
          <Typography tone="muted" variant="bodySm">
            {POLYMER.metricsLead}
          </Typography>
          {/* One square tag per line with a node: never a bulleted list. */}
          <ul className="grid justify-items-start gap-2">
            {POLYMER.metrics.map((metric) => (
              <Typography
                as="li"
                className="flex items-center gap-2 rounded-sm border border-border px-3 py-1.5 before:size-1.5 before:shrink-0 before:bg-primary"
                key={metric}
                variant="bodyXs"
              >
                {metric}
              </Typography>
            ))}
          </ul>
          <Typography variant="bodySmMedium">{POLYMER.winner}</Typography>
        </CardContent>
      </Card>

      <section className="grid gap-1.5 rounded-r-lg border-l-[3px] border-primary bg-primary/5 px-5 py-4">
        <Typography tone="muted" variant="captionMedium">
          {POLYMER.flowLead}
        </Typography>
        <Typography variant="body">{POLYMER.flow}</Typography>
      </section>
      {!done && <ScanButton label="Сканировать QR-код" to="/app/scan" />}
    </div>
  )
}
