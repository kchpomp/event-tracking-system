import { PrinterIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useState } from 'react'

import { PageContainer, PageHeader } from '@/components/PageLayout'
import { Typography } from '@/components/typography'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { eventErrorMessage } from './errors'
import { stationLabel } from './model'
import { useAdminStationsQuery, useSetEventActiveMutation } from './queries'

export function AdminStations() {
  const stations = useAdminStationsQuery()
  const setActive = useSetEventActiveMutation()

  return (
    <PageContainer>
      <PageHeader
        actions={
          <Button className="print:hidden" onClick={() => window.print()} type="button" variant="outline">
            <HugeiconsIcon aria-hidden data-icon="inline-start" icon={PrinterIcon} strokeWidth={2} />
            Печать
          </Button>
        }
        description="QR-коды станций для печати. Код секретный: кто его видит, тот может получить баллы станции. Не показывайте эту страницу участникам."
        title="Станции"
      />

      {stations.isPending && <Skeleton className="h-40 w-full" />}
      {stations.isError && (
        <Alert variant="destructive">
          <AlertTitle>Не удалось загрузить станции</AlertTitle>
          <AlertDescription>{eventErrorMessage(stations.error)}</AlertDescription>
        </Alert>
      )}

      {stations.data && !stations.data.event && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Мероприятия пока нет</EmptyTitle>
            <Typography tone="muted" variant="bodySm">
              Создайте его командой bun run --cwd backend event:seed.
            </Typography>
          </EmptyHeader>
        </Empty>
      )}

      {stations.data?.event && (
        <>
          <Card className="print:hidden">
            <CardContent className="flex items-center justify-between gap-4">
              <div className="grid gap-1">
                <Typography variant="bodySmMedium">Сканирование идёт</Typography>
                <Typography tone="muted" variant="bodySm">
                  {stations.data.event.isActive
                    ? 'Участники получают баллы за сканирование.'
                    : 'Мероприятие закрыто: сканирование отклоняется.'}
                </Typography>
                {setActive.isError && (
                  <Typography role="alert" tone="destructive" variant="bodyXs">
                    {eventErrorMessage(setActive.error)}
                  </Typography>
                )}
              </div>
              <Switch
                aria-label="Сканирование идёт"
                checked={stations.data.event.isActive}
                disabled={setActive.isPending}
                onCheckedChange={(checked) => setActive.mutate(checked)}
              />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3">
            {stations.data.stations.map((station) => (
              <Card className="break-inside-avoid" key={station.id}>
                <CardContent className="grid justify-items-center gap-3">
                  <StationQr token={station.qrToken} />
                  <Typography align="center" variant="bodySmMedium">
                    {stationLabel(station)}
                  </Typography>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{station.points} оч</Badge>
                    {!station.isActive && <Badge variant="outline">Неактивна</Badge>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </PageContainer>
  )
}

function StationQr({ token }: { token: string }) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void import('qrcode').then(async ({ default: QRCode }) => {
      const url = await QRCode.toDataURL(token, { width: 220, margin: 2 })
      if (!cancelled) setSrc(url)
    })
    return () => {
      cancelled = true
    }
  }, [token])

  if (!src) return <Skeleton className="size-[220px]" />
  return <img alt="QR-код станции" className="size-[220px] rounded-md bg-white" src={src} />
}
