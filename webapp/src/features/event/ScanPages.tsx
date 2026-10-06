import { useNavigate } from '@tanstack/react-router'
import { DIFFUSION_GOAL } from '@event-tracking-system/contracts'
import { useState } from 'react'

import { Typography } from '@/components/typography'
import { Spinner } from '@/components/ui/spinner'
import { eventErrorMessage } from './errors'
import { pointsWord, tokenFrom } from './model'
import { ActivityHead, ResultDialog } from './parts'
import { useResultDialog, type Result } from './use-result-dialog'
import { QrScanner } from './QrScanner'
import { useConnectMutation, useScanMutation } from './queries'

type Leave = '/app' | '/app/diffusion'

type Outcome = Omit<Result, 'onClose' | 'autoCloseMs'> & {
  /** true: the scan is finished, go back to `leaveTo`; false: reopen the camera. */
  leave: boolean
}

/**
 * The camera, a "checking" note while the code is verified, and the result popup. A scan that was
 * understood leaves the page after the popup; one the backend refused reopens the camera.
 */
function ScanScreen({
  back,
  leaveTo,
  resolve,
  title,
}: {
  back: Leave
  leaveTo: Leave
  resolve: (token: string) => Promise<Outcome>
  title: string
}) {
  const navigate = useNavigate()
  const dialog = useResultDialog()
  const [round, setRound] = useState(0) // a new round mounts a new scanner, which reopens the camera
  const [checking, setChecking] = useState(false)

  async function handleDecoded(text: string) {
    setChecking(true)
    const { leave, ...result } = await resolve(tokenFrom(text))
    dialog.show({
      ...result,
      autoCloseMs: 3000,
      onClose: leave
        ? () => void navigate({ to: leaveTo })
        : () => {
            setChecking(false)
            setRound((current) => current + 1)
          },
    })
  }

  return (
    <div className="grid gap-6">
      <ActivityHead back={back} title={title} />
      {checking ? (
        <div className="flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-xl bg-muted" role="status">
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
          Наведите камеру на QR‑код
        </Typography>
        <Typography align="center" tone="muted" variant="bodySm">
          Держите устройство неподвижно
        </Typography>
      </div>
      <ResultDialog onDismiss={dialog.dismiss} result={dialog.result} />
    </div>
  )
}

export function StationScanPage() {
  const scan = useScanMutation()

  async function resolve(token: string): Promise<Outcome> {
    try {
      const result = await scan.mutateAsync({ token })
      if (result.alreadyCompleted) {
        return {
          variant: 'warning',
          title: 'Уже отсканировано',
          message: `Вы уже получили очки за эту станцию. Ваш текущий счёт: ${result.totalPoints}.`,
          leave: true,
        }
      }
      return {
        variant: 'success',
        title: 'Очки начислены!',
        message:
          result.successMessage ??
          `${pointsWord(result.pointsAwarded)}, ваш счёт теперь ${result.totalPoints}.`,
        leave: true,
      }
    } catch (error) {
      return {
        variant: 'error',
        title: 'Ошибка сканирования',
        message: eventErrorMessage(error),
        leave: false,
      }
    }
  }

  return <ScanScreen back="/app" leaveTo="/app" resolve={resolve} title="Сканировать QR маршрута" />
}

export function DiffusionScanPage() {
  const connect = useConnectMutation()

  async function resolve(token: string): Promise<Outcome> {
    try {
      const { alreadyConnected, connectionsCount } = await connect.mutateAsync({ token })
      if (alreadyConnected) {
        return {
          variant: 'warning',
          title: 'Уже создано',
          message: 'Связь с этим участником уже создана.',
          leave: true,
        }
      }
      if (connectionsCount >= DIFFUSION_GOAL) {
        return {
          variant: 'success',
          title: 'Новое соединение создано',
          message: 'Диффузия завершена. Вы создали 3 новых профессиональных связи.',
          leave: true,
        }
      }
      return {
        variant: 'success',
        title: 'Новое соединение создано',
        message: `Связей: ${connectionsCount} из ${DIFFUSION_GOAL}.`,
        leave: true,
      }
    } catch (error) {
      return {
        variant: 'error',
        title: 'Не удалось создать связь',
        message: eventErrorMessage(error),
        leave: false,
      }
    }
  }

  return (
    <ScanScreen
      back="/app/diffusion"
      leaveTo="/app/diffusion"
      resolve={resolve}
      title="Сканировать QR участника"
    />
  )
}
