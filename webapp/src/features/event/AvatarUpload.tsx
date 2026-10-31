import { useRef, useState } from 'react'

import { Typography } from '@/components/typography'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { toSquareJpeg } from './avatar-photo'
import { eventErrorMessage } from './errors'
import { useAvatarApi, useMyAvatarQuery } from './queries'

type Status = { state: 'idle' | 'working' } | { state: 'error'; message: string }

const READ_ERROR = 'Не удалось прочитать фото. Выберите снимок в формате JPEG или PNG.'

/** The participant's own photo: pick, crop to a square in the browser, send straight to storage. */
export function AvatarUpload() {
  const api = useAvatarApi()
  const own = useMyAvatarQuery()
  const input = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<Status>({ state: 'idle' })
  const working = status.state === 'working'

  async function upload(file: File) {
    setStatus({ state: 'working' })
    let blob: Blob
    try {
      blob = await toSquareJpeg(file)
    } catch {
      setStatus({ state: 'error', message: READ_ERROR })
      return
    }
    try {
      const { upload: ticket } = await api.ticket({ contentType: 'image/jpeg', byteSize: blob.size })
      const headers = new Headers(ticket.headers)
      headers.delete('content-length') // the browser sets it from the body
      const response = await fetch(ticket.url, { method: 'PUT', headers, body: blob })
      if (!response.ok) throw new Error(String(response.status))
      await api.finalize(ticket.uploadId)
      await api.refresh()
      setStatus({ state: 'idle' })
    } catch (error) {
      setStatus({ state: 'error', message: eventErrorMessage(error) })
    }
  }

  async function remove() {
    setStatus({ state: 'working' })
    try {
      await api.remove()
      await api.refresh()
      setStatus({ state: 'idle' })
    } catch (error) {
      setStatus({ state: 'error', message: eventErrorMessage(error) })
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <input
          accept="image/*"
          data-testid="avatar-input"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = '' // the same file can be picked again
            if (file) void upload(file)
          }}
          ref={input}
          type="file"
        />
        <Button
          data-testid="avatar-upload"
          disabled={working}
          onClick={() => input.current?.click()}
          type="button"
          variant="outline"
        >
          {own.data?.avatar ? 'Заменить фото' : 'Загрузить фото'}
        </Button>
        {own.data?.avatar && (
          <Button data-testid="avatar-remove" disabled={working} onClick={() => void remove()} type="button" variant="ghost">
            Удалить фото
          </Button>
        )}
      </div>
      {working && (
        <Typography role="status" tone="muted" variant="bodySm">
          Загружаем…
        </Typography>
      )}
      {status.state === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>{status.message}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
