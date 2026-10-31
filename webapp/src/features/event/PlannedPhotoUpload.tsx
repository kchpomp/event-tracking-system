import { useMemo, useState } from 'react'
import type { PlannedParticipant } from '@event-tracking-system/contracts'

import { Typography } from '@/components/typography'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { toSquareJpeg } from './avatar-photo'
import { eventErrorMessage } from './errors'
import { chunk, matchPhotoFiles, PHOTO_SIDE, PHOTO_STREAMS, runPool } from './planned-photos'
import { usePlannedPhotoApi } from './queries'

type Status = { state: 'working' | 'done' } | { state: 'error'; message: string }
type Api = ReturnType<typeof usePlannedPhotoApi>

const FINALIZE_ERROR = {
  not_listed: 'Нет в списке.',
  not_uploaded: 'Файл не дошёл до хранилища.',
  rejected: 'Сервер не принял изображение.',
} as const

/** One batch: resize, tickets, PUT straight to storage, finalize. Reports each file by email. */
async function sendBatch(
  batch: Array<{ email: string; file: File }>,
  api: Api,
  set: (email: string, status: Status) => void,
) {
  const fail = (email: string, message: string) => set(email, { state: 'error', message })
  const blobs = new Map<string, Blob>()
  await runPool(batch, PHOTO_STREAMS, async ({ email, file }) => {
    set(email, { state: 'working' })
    try {
      blobs.set(email, await toSquareJpeg(file))
    } catch {
      fail(email, 'Не удалось прочитать изображение.')
    }
  })
  const ready = batch.filter(({ email }) => blobs.has(email))
  if (ready.length === 0) return

  let tickets
  try {
    const items = ready.map(({ email }) => ({
      email,
      contentType: 'image/jpeg' as const,
      byteSize: blobs.get(email)!.size,
    }))
    tickets = (await api.tickets({ items })).tickets
  } catch (error) {
    for (const { email } of ready) fail(email, eventErrorMessage(error))
    return
  }

  const uploaded: Array<{ email: string; objectKey: string }> = []
  await runPool(tickets, PHOTO_STREAMS, async ({ email, objectKey, upload }) => {
    try {
      const headers = new Headers(upload.headers)
      headers.delete('content-length') // the browser sets it from the body
      const response = await fetch(upload.url, { method: 'PUT', headers, body: blobs.get(email) })
      if (!response.ok) throw new Error(String(response.status))
      uploaded.push({ email, objectKey })
    } catch {
      fail(email, 'Не удалось загрузить файл.')
    }
  })
  if (uploaded.length === 0) return

  try {
    const { results } = await api.finalize({ items: uploaded })
    for (const { email, status } of results) {
      set(email, status === 'stored' ? { state: 'done' } : { state: 'error', message: FINALIZE_ERROR[status] })
    }
  } catch (error) {
    for (const { email } of uploaded) fail(email, eventErrorMessage(error))
  }
}

function Names({ label, names, testId }: { label: string; names: readonly string[]; testId: string }) {
  if (names.length === 0) return null
  return (
    <Typography data-testid={testId} tone="muted" variant="bodyXs">
      {label}: {names.length}. {names.slice(0, 5).join(', ')}
      {names.length > 5 ? ` и ещё ${names.length - 5}` : ''}
    </Typography>
  )
}

/** Bulk photos for the guest list: the file name (without extension) is the email. */
export function PlannedPhotoUpload({ items }: { items: readonly PlannedParticipant[] }) {
  const api = usePlannedPhotoApi()
  const [files, setFiles] = useState<File[]>([])
  const [statuses, setStatuses] = useState<Record<string, Status>>({})
  const [running, setRunning] = useState(false)

  const report = useMemo(
    () => matchPhotoFiles(files, new Set(items.map((item) => item.email.toLowerCase()))),
    [files, items],
  )
  const entries = Object.entries(statuses)
  const done = entries.filter(([, status]) => status.state === 'done').length
  const failed = entries.flatMap(([email, status]) => (status.state === 'error' ? [{ email, message: status.message }] : []))

  async function send(batchItems: typeof report.matched) {
    setRunning(true)
    const set = (email: string, status: Status) => setStatuses((current) => ({ ...current, [email]: status }))
    try {
      for (const batch of chunk(batchItems)) await sendBatch(batch, api, set)
    } finally {
      setRunning(false)
      void api.refresh()
    }
  }

  function pick(list: FileList | null) {
    setStatuses({})
    setFiles(list ? [...list] : [])
  }

  const toSend = report.matched.filter(({ email }) => statuses[email]?.state !== 'done')

  return (
    <Card data-testid="photo-upload">
      <CardContent className="grid gap-3">
        <Typography as="h2" variant="h6">
          Загрузить фото
        </Typography>
        <Typography tone="muted" variant="bodySm">
          Имя файла без расширения — адрес электронной почты: anna@example.com.jpg. Форматы JPEG, PNG,
          WebP. Перед отправкой каждое фото обрезается до квадрата {PHOTO_SIDE}×{PHOTO_SIDE} px. Новое фото заменяет старое.
        </Typography>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            accept="image/jpeg,image/png,image/webp"
            aria-label="Выбрать фото"
            data-testid="photo-files"
            disabled={running}
            multiple
            onChange={(event) => {
              pick(event.target.files)
              event.target.value = ''
            }}
            type="file"
          />
          <Input
            aria-label="Выбрать папку с фото"
            data-testid="photo-folder"
            disabled={running}
            onChange={(event) => {
              pick(event.target.files)
              event.target.value = ''
            }}
            type="file"
            {...{ webkitdirectory: '' }}
          />
        </div>

        {files.length > 0 && (
          <div className="grid gap-1" data-testid="photo-report">
            <Typography variant="bodySmMedium">
              Готово к загрузке: {report.matched.length} из {files.length}
            </Typography>
            <Names label="Нет в списке" names={report.notListed.map((file) => file.name)} testId="photo-not-listed" />
            <Names label="Дубли (не отправляются)" names={report.duplicates.map((file) => file.name)} testId="photo-duplicates" />
            <Names label="Не поддерживается" names={report.unsupported.map((file) => file.name)} testId="photo-unsupported" />
          </div>
        )}

        {entries.length > 0 && (
          <div className="grid gap-2" data-testid="photo-progress">
            <Progress value={(done / Math.max(entries.length, 1)) * 100} />
            <Typography role="status" tone="muted" variant="bodyXs">
              Загружено {done} из {entries.length}. Ошибок: {failed.length}.
            </Typography>
          </div>
        )}
        {failed.length > 0 && (
          <ul className="grid gap-1" data-testid="photo-errors">
            {failed.map(({ email, message }) => (
              <li key={email}>
                <Typography role="alert" tone="destructive" variant="bodyXs">
                  {email}: {message}
                </Typography>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            data-testid="photo-send"
            disabled={running || toSend.length === 0}
            onClick={() => void send(toSend)}
            type="button"
          >
            {running ? 'Загружаем…' : `Загрузить фото (${toSend.length})`}
          </Button>
          {failed.length > 0 && (
            <Button
              data-testid="photo-retry"
              disabled={running}
              onClick={() => void send(toSend.filter(({ email }) => statuses[email]?.state === 'error'))}
              type="button"
              variant="outline"
            >
              Повторить ошибки ({failed.length})
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
