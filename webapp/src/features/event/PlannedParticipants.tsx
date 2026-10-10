import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import type { PlannedKind, PlannedParticipant, PlannedSummary } from '@event-tracking-system/contracts'

import { SectionCards } from '@/components/dashboard'
import { PageContainer, PageHeader } from '@/components/PageLayout'
import { Typography } from '@/components/typography'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { eventErrorMessage } from './errors'
import { downloadCsv, plannedCsv, spreadsheetToText } from './planned-file'
import {
  filterPlanned,
  hostessesWithoutRole,
  KIND_TEXT,
  ofKind,
  parsePlannedLines,
  plannedLabel,
  plannedStatus,
  readyForHostessRole,
  type PlannedFilter,
} from './planned-model'
import {
  useImportPlannedMutation,
  useMakeHostessMutation,
  usePlannedParticipantsQuery,
  useRemovePlannedMutation,
} from './queries'

const OVERVIEW_LIST_SIZE = 10
const KINDS: readonly PlannedKind[] = ['participant', 'hostess']

function downloadNotRegistered(kind: PlannedKind, items: readonly PlannedParticipant[]) {
  downloadCsv(KIND_TEXT[kind].file, plannedCsv(ofKind(items, kind).filter((item) => !item.registered)))
}

function summaryCards(kind: PlannedKind, summary: PlannedSummary) {
  const text = KIND_TEXT[kind]
  return [
    { label: text.planned, value: summary.planned.toLocaleString() },
    {
      description:
        summary.planned === 0
          ? 'Список не загружен.'
          : `Не зарегистрировались: ${(summary.planned - summary.registered).toLocaleString()}.`,
      label: text.registered,
      value: summary.registered.toLocaleString(),
    },
    { label: text.actual, value: summary.actual.toLocaleString() },
  ]
}

/** Overview: for participants and for hostesses, planned against actual and who is still missing. */
export function PlannedOverview() {
  const query = usePlannedParticipantsQuery()

  if (query.isPending) return <Skeleton className="h-40 w-full" />
  if (query.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Списки участников недоступны</AlertTitle>
        <AlertDescription>{eventErrorMessage(query.error)}</AlertDescription>
      </Alert>
    )
  }

  const { hostesses, items, participants } = query.data
  const summaries = { hostess: hostesses, participant: participants }

  return (
    <div className="grid gap-8">
      {KINDS.map((kind) => {
        const pending = ofKind(items, kind).filter((item) => !item.registered)
        return (
          <section className="grid gap-4" data-testid={`overview-${kind}`} key={kind}>
            <Typography as="h2" variant="h5">
              {KIND_TEXT[kind].plural}
            </Typography>
            <SectionCards items={summaryCards(kind, summaries[kind])} />

            <Card>
              <CardContent className="grid gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Typography as="h3" variant="h6">
                    Ещё не зарегистрировались: {pending.length}
                  </Typography>
                  <Button
                    data-testid={`download-${kind}`}
                    disabled={pending.length === 0}
                    onClick={() => downloadNotRegistered(kind, items)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Скачать список (CSV)
                  </Button>
                </div>
                {summaries[kind].planned === 0 ? (
                  <Typography tone="muted" variant="bodySm">
                    Список пока пуст.{' '}
                    <Link className="underline underline-offset-4" to="/admin/participants">
                      Загрузить список
                    </Link>
                  </Typography>
                ) : pending.length === 0 ? (
                  <Typography tone="muted" variant="bodySm">
                    Все из списка уже зарегистрировались.
                  </Typography>
                ) : (
                  <>
                    <PlannedRows items={pending.slice(0, OVERVIEW_LIST_SIZE)} kind={kind} />
                    {pending.length > OVERVIEW_LIST_SIZE && (
                      <Typography tone="muted" variant="bodySm">
                        И ещё {pending.length - OVERVIEW_LIST_SIZE}.{' '}
                        <Link className="underline underline-offset-4" to="/admin/participants">
                          Весь список
                        </Link>
                      </Typography>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
            {kind === 'hostess' && <HostessRoleQueue items={items} />}
          </section>
        )
      })}
    </div>
  )
}

/**
 * Registered hostesses waiting for the role. The one button is offered only when the account name
 * holds the listed first and last name; a registration does not prove the address is the person's,
 * so the administrator confirms each one, and anything that does not match is shown, not offered.
 */
function HostessRoleQueue({ items }: { items: readonly PlannedParticipant[] }) {
  const mutation = useMakeHostessMutation()
  const [chosen, setChosen] = useState<PlannedParticipant | null>(null)
  const waiting = hostessesWithoutRole(items)
  const ready = readyForHostessRole(items)
  const others = waiting.filter((item) => !ready.includes(item))
  if (waiting.length === 0) return null

  return (
    <Card data-testid="hostess-role-queue">
      <CardContent className="grid gap-3">
        <Typography as="h3" variant="h6">
          Ждут роли хостес: {waiting.length}
        </Typography>
        <Typography tone="muted" variant="bodySm">
          Они уже зарегистрировались, но пока играют как участники. Роль выдаётся после вашего
          подтверждения.
        </Typography>
        {ready.length > 0 && (
          <ul className="divide-y divide-border" data-testid="hostess-ready">
            {ready.map((item) => (
              <li className="flex items-center justify-between gap-3 py-2" key={item.id}>
                <div className="grid min-w-0">
                  <Typography truncate variant="bodySmMedium">
                    {item.accountName}
                  </Typography>
                  <Typography truncate tone="muted" variant="bodyXs">
                    {item.email}
                  </Typography>
                </div>
                <Button
                  data-testid="make-hostess"
                  onClick={() => {
                    mutation.reset()
                    setChosen(item)
                  }}
                  size="sm"
                  type="button"
                >
                  Назначить хостес
                </Button>
              </li>
            ))}
          </ul>
        )}
        {others.length > 0 && (
          <div className="grid gap-2" data-testid="hostess-mismatch">
            <Typography variant="bodySmMedium">Проверьте вручную</Typography>
            <ul className="divide-y divide-border">
              {others.map((item) => (
                <li className="grid gap-0.5 py-2" key={item.id}>
                  <Typography truncate variant="bodySm">
                    {item.email}
                  </Typography>
                  <Typography tone="muted" variant="bodyXs">
                    {item.fullName
                      ? `В списке: ${item.fullName}. В аккаунте: ${item.accountName ?? 'имя не указано'}.`
                      : `В списке нет имени. В аккаунте: ${item.accountName ?? 'имя не указано'}.`}
                  </Typography>
                </li>
              ))}
            </ul>
            <Typography tone="muted" variant="bodyXs">
              Если это тот человек, назначьте роль на странице{' '}
              <Link className="underline underline-offset-4" to="/admin/users">
                «Пользователи»
              </Link>
              . Если нет, адрес мог занять другой человек.
            </Typography>
          </div>
        )}
      </CardContent>

      <AlertDialog onOpenChange={(open) => !open && !mutation.isPending && setChosen(null)} open={chosen !== null}>
        <AlertDialogContent>
          <AlertDialogHeader className="place-items-start text-left">
            <AlertDialogTitle>Назначить роль хостес?</AlertDialogTitle>
            <AlertDialogDescription>
              {chosen
                ? `${chosen.accountName} (${chosen.email}). Все сессии этого человека завершатся, а его баллы и отметки о посещении станций будут удалены безвозвратно.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {mutation.isError && (
            <Typography role="alert" tone="destructive" variant="bodyXs">
              {eventErrorMessage(mutation.error)}
            </Typography>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Отмена</AlertDialogCancel>
            <Button
              data-testid="make-hostess-confirm"
              disabled={mutation.isPending}
              onClick={() => {
                if (!chosen?.userId) return
                mutation.mutate(chosen.userId, { onSuccess: () => setChosen(null) })
              }}
              type="button"
            >
              {mutation.isPending ? 'Назначаем…' : 'Назначить'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

function PlannedRows({
  items,
  kind,
  onRemove,
}: {
  items: readonly PlannedParticipant[]
  kind: PlannedKind
  onRemove?: (item: PlannedParticipant) => void
}) {
  return (
    <ul className="divide-y divide-border" data-testid={`planned-rows-${kind}`}>
      {items.map((item) => {
        const status = plannedStatus(item)
        return (
          <li className="flex items-center justify-between gap-3 py-2" key={item.id}>
            <div className="grid min-w-0">
              <Typography truncate variant="bodySmMedium">
                {plannedLabel(item)}
              </Typography>
              {item.fullName && (
                <Typography truncate tone="muted" variant="bodyXs">
                  {item.email}
                </Typography>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <Typography as="span" tone={status.done ? 'primary' : 'muted'} variant="bodyXs">
                {status.text}
              </Typography>
              {onRemove && (
                <Button
                  aria-label={`Убрать из списка: ${plannedLabel(item)}`}
                  onClick={() => onRemove(item)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Убрать
                </Button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

const FILTERS: ReadonlyArray<{ key: PlannedFilter; label: string }> = [
  { key: 'pending', label: 'Не зарегистрировались' },
  { key: 'registered', label: 'Зарегистрировались' },
  { key: 'all', label: 'Все' },
]

/** One list: load it from a file or the paste box, then see who has and has not signed up. */
function PlannedKindPanel({
  items,
  kind,
  summary,
}: {
  items: readonly PlannedParticipant[]
  kind: PlannedKind
  summary: PlannedSummary
}) {
  const importer = useImportPlannedMutation()
  const remover = useRemovePlannedMutation()
  const [text, setText] = useState('')
  const [filter, setFilter] = useState<PlannedFilter>('pending')
  const [result, setResult] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  const parsed = parsePlannedLines(text)
  const own = ofKind(items, kind)
  const shown = filterPlanned(own, filter)
  const missing = own.filter((item) => !item.registered).length

  async function readFile(file: File | undefined) {
    setFileError(null)
    setResult(null)
    if (!file) return
    try {
      setText(await spreadsheetToText(file))
    } catch (error) {
      setFileError(error instanceof Error ? error.message : 'Не удалось прочитать файл.')
    }
  }

  async function submit() {
    setResult(null)
    if (parsed.entries.length === 0) return
    const { added, updated } = await importer.mutateAsync({ entries: parsed.entries, kind })
    setText('')
    setResult(`Добавлено: ${added}. Обновлено: ${updated}.`)
  }

  return (
    <div className="grid gap-6" data-testid={`planned-panel-${kind}`}>
      <Card>
        <CardContent className="grid gap-3">
          <Typography as="h2" variant="h6">
            Загрузить список: {KIND_TEXT[kind].plural.toLowerCase()}
          </Typography>
          <Typography tone="muted" variant="bodySm">
            Файл Excel (.xlsx) или CSV: адрес электронной почты в любом столбце, имя в соседнем.
            Заголовок в первой строке не нужен, но не помешает. Можно и вставить строки вручную.
            Повторная загрузка добавляет новых и дополняет имена, ничего не удаляя. Если адрес уже в
            другом списке, человек перейдёт в этот.
          </Typography>
          <Input
            accept=".xlsx,.csv,.txt,text/csv"
            aria-label={`Файл со списком: ${KIND_TEXT[kind].plural.toLowerCase()}`}
            data-testid={`planned-file-${kind}`}
            onChange={(event) => {
              void readFile(event.target.files?.[0])
              event.target.value = ''
            }}
            type="file"
          />
          {fileError && (
            <Typography role="alert" tone="destructive" variant="bodyXs">
              {fileError}
            </Typography>
          )}
          <Textarea
            aria-label={`Список: ${KIND_TEXT[kind].plural.toLowerCase()}`}
            data-testid={`planned-input-${kind}`}
            onChange={(event) => setText(event.target.value)}
            placeholder={'anna@example.com; Анна Петрова\noleg@example.com; Олег Иванов'}
            rows={5}
            value={text}
          />
          {parsed.invalid.length > 0 && (
            <Alert variant="destructive">
              <AlertTitle>В этих строках нет адреса электронной почты</AlertTitle>
              <AlertDescription>
                {parsed.invalid.slice(0, 5).join('; ')}
                {parsed.invalid.length > 5 ? ` и ещё ${parsed.invalid.length - 5}` : ''}
              </AlertDescription>
            </Alert>
          )}
          {parsed.truncated && (
            <Typography role="alert" tone="destructive" variant="bodyXs">
              За один раз загружаются первые 2000 строк, остальные загрузите отдельно.
            </Typography>
          )}
          {importer.isError && (
            <Typography role="alert" tone="destructive" variant="bodyXs">
              {eventErrorMessage(importer.error)}
            </Typography>
          )}
          {result && (
            <Typography data-testid={`planned-result-${kind}`} role="status" tone="primary" variant="bodySm">
              {result}
            </Typography>
          )}
          <div>
            <Button
              data-testid={`planned-import-${kind}`}
              disabled={importer.isPending || parsed.entries.length === 0}
              onClick={() => void submit()}
              type="button"
            >
              {importer.isPending ? 'Загружаем…' : `Загрузить (${parsed.entries.length})`}
            </Button>
          </div>
        </CardContent>
      </Card>

      {kind === 'hostess' && <HostessRoleQueue items={items} />}

      <section className="grid gap-3">
        <SectionCards items={summaryCards(kind, summary)} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div aria-label="Показать" className="flex flex-wrap gap-2" role="group">
            {FILTERS.map(({ key, label }) => (
              <Button
                aria-pressed={filter === key}
                data-testid={`planned-filter-${kind}-${key}`}
                key={key}
                onClick={() => setFilter(key)}
                size="sm"
                type="button"
                variant={filter === key ? 'default' : 'outline'}
              >
                {label}
              </Button>
            ))}
          </div>
          <Button
            data-testid={`download-${kind}`}
            disabled={missing === 0}
            onClick={() => downloadNotRegistered(kind, items)}
            size="sm"
            type="button"
            variant="outline"
          >
            Скачать не зарегистрировавшихся (CSV): {missing}
          </Button>
        </div>
        <Card>
          <CardContent>
            {shown.length === 0 ? (
              <Typography tone="muted" variant="bodySm">
                {own.length === 0 ? 'Список пока пуст.' : 'В этом разделе никого нет.'}
              </Typography>
            ) : (
              <PlannedRows items={shown} kind={kind} onRemove={(item) => remover.mutate(item.id)} />
            )}
            {remover.isError && (
              <Typography role="alert" tone="destructive" variant="bodyXs">
                {eventErrorMessage(remover.error)}
              </Typography>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

export function PlannedParticipantsPage() {
  const query = usePlannedParticipantsQuery()
  const [kind, setKind] = useState<PlannedKind>('participant')

  return (
    <PageContainer>
      <PageHeader
        description="Кого вы ждёте на мероприятии: участники и хостесс — два отдельных списка. Список сопоставляется с аккаунтами по адресу электронной почты."
        title="Участники и хостесс"
      />

      {query.isPending && <Skeleton className="h-40 w-full" />}
      {query.isError && (
        <Alert variant="destructive">
          <AlertTitle>Не удалось загрузить списки</AlertTitle>
          <AlertDescription>{eventErrorMessage(query.error)}</AlertDescription>
        </Alert>
      )}

      {query.data && (
        <>
          <div aria-label="Список" className="flex flex-wrap gap-2" role="group">
            {KINDS.map((key) => {
              const summary = key === 'participant' ? query.data.participants : query.data.hostesses
              return (
                <Button
                  aria-pressed={kind === key}
                  data-testid={`planned-tab-${key}`}
                  key={key}
                  onClick={() => setKind(key)}
                  type="button"
                  variant={kind === key ? 'default' : 'outline'}
                >
                  {KIND_TEXT[key].plural}: {summary.registered} из {summary.planned}
                </Button>
              )
            })}
          </div>
          <PlannedKindPanel
            items={query.data.items}
            key={kind}
            kind={kind}
            summary={kind === 'participant' ? query.data.participants : query.data.hostesses}
          />
        </>
      )}
    </PageContainer>
  )
}
