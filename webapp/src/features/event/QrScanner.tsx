import type { Html5Qrcode } from 'html5-qrcode'
import { useEffect, useRef, useState } from 'react'

import { Typography } from '@/components/typography'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

const READER_ID = 'qr-reader'

/**
 * The rear camera, scanning QR codes only (there is no file-upload fallback on purpose).
 *
 * `Html5Qrcode` is used directly, not `Html5QrcodeScanner`, to skip its camera-picker dropdown:
 * participants get the rear camera at once. The library is loaded on demand. It stops the camera
 * before reporting a code, so the camera is always released by the time the caller reacts, and
 * when the component unmounts.
 */
export function QrScanner({ onDecoded }: { onDecoded: (text: string) => void }) {
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const onDecodedRef = useRef(onDecoded)

  useEffect(() => {
    onDecodedRef.current = onDecoded
  })

  useEffect(() => {
    let cancelled = false
    let handled = false
    let running = false
    let scanner: Html5Qrcode | null = null

    const stop = async () => {
      if (!scanner || !running) return
      running = false
      try {
        await scanner.stop()
        scanner.clear()
      } catch {
        // Already stopped.
      }
    }

    void (async () => {
      const { Html5Qrcode } = await import('html5-qrcode')
      if (cancelled) return
      scanner = new Html5Qrcode(READER_ID)
      try {
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: 250 },
          (text) => {
            if (handled) return
            handled = true
            void stop().then(() => onDecodedRef.current(text))
          },
          () => undefined, // Called for every frame with no code in it: silent on purpose.
        )
        running = true
        if (cancelled) await stop()
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()

    return () => {
      cancelled = true
      void stop()
    }
  }, [attempt])

  if (failed) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Камера недоступна</AlertTitle>
        <AlertDescription className="grid justify-items-start gap-3">
          <Typography as="span" variant="bodySm">
            Не удалось получить доступ к камере. Проверьте разрешения браузера и повторите попытку.
          </Typography>
          <Button
            onClick={() => {
              setFailed(false)
              setAttempt((current) => current + 1)
            }}
            size="lg"
            type="button"
            variant="outline"
          >
            Повторить
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div
      className="aspect-square w-full overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/10"
      id={READER_ID}
    />
  )
}
