import {
  Alert02Icon,
  ArrowLeft01Icon,
  Cancel01Icon,
  Tick02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { Fragment, useCallback, useEffect, useRef, type ReactNode } from 'react'

import { Typography } from '@/components/typography'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { Result } from './use-result-dialog'

export function Brand() {
  return (
    <Typography as="span" variant="h5" wrap="nowrap">
      Формула{' '}
      <Typography as="span" variant="h5" tone="primary">
        Будущего
      </Typography>
    </Typography>
  )
}

/** The head of an activity page: a way back to the list, the title, and the activity's own icon. */
export function ActivityHead({
  back = '/app',
  icon,
  title,
}: {
  back?: '/app' | '/app/diffusion'
  icon?: ReactNode
  title: string
}) {
  return (
    <div className="flex items-center gap-3">
      <Button asChild aria-label="Назад" size="icon-lg" variant="outline">
        <Link to={back}>
          <HugeiconsIcon aria-hidden icon={ArrowLeft01Icon} strokeWidth={2} />
        </Link>
      </Button>
      <Typography as="h1" className="flex min-w-0 items-center gap-2" variant="h5">
        {icon}
        {title}
      </Typography>
    </div>
  )
}

/** The progress stat shared by «Диффузия», «Колба идей» and the station page: always the first block. */
export function StatCard({
  label,
  side,
  value,
}: {
  label: string
  side?: ReactNode
  value: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4">
        <div className="grid gap-1">
          <Typography tone="muted" variant="captionMedium">
            {label}
          </Typography>
          {/* lining-nums: the heading font draws old-style digits, so "10" would read as "1O". */}
          <Typography as="p" className="lining-nums tabular-nums" variant="h3">
            {value}
          </Typography>
        </div>
        {side}
      </CardContent>
    </Card>
  )
}

/** Nodes joined by lines, one node filled per step done. */
export function MiniChain({ goal, n }: { goal: number; n: number }) {
  return (
    <div aria-hidden className="flex items-center">
      {Array.from({ length: goal }, (_, index) => (
        <Fragment key={index}>
          {index > 0 && <span className={cn('h-0.5 w-4', index < n ? 'bg-primary' : 'bg-border')} />}
          <span className={cn('size-3 rounded-full', index < n ? 'bg-primary' : 'bg-border')} />
        </Fragment>
      ))}
    </div>
  )
}

export function LoadingState() {
  return (
    <div aria-busy="true" className="grid gap-4" role="status">
      <Typography as="span" variant="srOnly">
        Загрузка…
      </Typography>
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  )
}

export function LoadErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Не удалось загрузить данные</AlertTitle>
      <AlertDescription className="grid justify-items-start gap-3">
        <Typography as="span" variant="bodySm">
          Проверьте соединение и попробуйте ещё раз.
        </Typography>
        <Button onClick={onRetry} size="lg" type="button" variant="outline">
          Повторить
        </Button>
      </AlertDescription>
    </Alert>
  )
}

const RESULT_ICON: Record<Result['variant'], { icon: IconSvgElement; tone: string }> = {
  success: { icon: Tick02Icon, tone: 'bg-primary/10 text-primary' },
  warning: { icon: Alert02Icon, tone: 'bg-muted text-foreground' },
  error: { icon: Cancel01Icon, tone: 'bg-destructive/10 text-destructive' },
}

/** One popup at a time: its title, its message, an OK button and an optional auto-close. */
export function ResultDialog({
  onDismiss,
  result,
}: {
  /** Must be stable (the one from useResultDialog): the auto-close timer restarts when it changes. */
  onDismiss: () => void
  result: Result | null
}) {
  const finishedFor = useRef<Result | null>(null)
  // The button, the timer and a click outside all end up here, and only the first one counts.
  const finish = useCallback(() => {
    if (!result || finishedFor.current === result) return
    finishedFor.current = result
    onDismiss()
    result.onClose?.()
  }, [onDismiss, result])

  useEffect(() => {
    if (!result?.autoCloseMs) return undefined
    const timer = setTimeout(finish, result.autoCloseMs)
    return () => clearTimeout(timer)
  }, [finish, result])

  if (!result) return null
  const tone = RESULT_ICON[result.variant]
  return (
    <Dialog onOpenChange={(open) => !open && finish()} open>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <span className={cn('flex size-14 items-center justify-center rounded-full', tone.tone)}>
            <HugeiconsIcon aria-hidden icon={tone.icon} strokeWidth={2} />
          </span>
          <DialogTitle>{result.title}</DialogTitle>
          <DialogDescription>{result.message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={finish} size="lg" type="button">
            ОК
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
