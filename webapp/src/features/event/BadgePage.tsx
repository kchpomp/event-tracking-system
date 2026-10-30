import { Award01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { Typography } from '@/components/typography'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Item, ItemContent, ItemGroup, ItemTitle } from '@/components/ui/item'
import { badgeJustIssued, badgeStatusText } from './badge-model'
import { BADGE_COPY } from './content'
import { ActivityHead, LoadErrorState, LoadingState, MyQr, StatCard } from './parts'
import { eventQueryKeys, useBadgeQuery, useEventMeQuery } from './queries'

const SEEN_KEY = 'badge-issued-seen'

function wasSeen() {
  try {
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    // No storage: the dialog is then once per page visit, which is still fine.
  }
}

/** «Значок» for the participant: progress, status and their own QR. Polls every 3 s while open. */
export function BadgePage() {
  const me = useEventMeQuery()
  const badge = useBadgeQuery()
  const queryClient = useQueryClient()
  const [congrats, setCongrats] = useState(false)
  const [seenIssued, setSeenIssued] = useState<boolean | undefined>(undefined)
  const issued = badge.data?.issued

  // Adjusted while rendering: the dialog opens on the render where `issued` turns on.
  if (issued !== seenIssued) {
    setSeenIssued(issued)
    if (badgeJustIssued(seenIssued, issued) && !wasSeen()) setCongrats(true)
  }

  useEffect(() => {
    if (congrats) markSeen() // once per device, even if the page is reloaded with the dialog open
  }, [congrats])

  useEffect(() => {
    // The point arrived: totals, leaderboard and progress refetch.
    if (issued) void queryClient.invalidateQueries({ queryKey: eventQueryKeys.all })
  }, [issued, queryClient])

  if (!badge.data || !me.data) {
    if (badge.isError || me.isError) {
      return (
        <LoadErrorState
          onRetry={() => {
            void badge.refetch()
            void me.refetch()
          }}
        />
      )
    }
    return <LoadingState />
  }

  const { activities, completed, required } = badge.data

  return (
    <div className="grid gap-6">
      <ActivityHead
        icon={<HugeiconsIcon aria-hidden className="size-5 text-primary" icon={Award01Icon} strokeWidth={2} />}
        title={BADGE_COPY.title}
      />
      <Card>
        <CardContent>
          <Typography variant="bodySm">{BADGE_COPY.description}</Typography>
        </CardContent>
      </Card>
      <StatCard label="Активностей" value={`Пройдено ${completed} из ${required}`} />
      {activities.length > 0 && (
        <ItemGroup className="gap-2" data-testid="badge-activities">
          {activities.map((activity) => (
            <Item key={activity.name} variant="outline">
              <ItemContent>
                <ItemTitle>
                  <HugeiconsIcon aria-hidden className="size-4 text-primary" icon={Tick02Icon} strokeWidth={2.5} />
                  {activity.name}
                </ItemTitle>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      )}
      <Typography data-testid="badge-status" variant="emphasis">
        {badgeStatusText(badge.data)}
      </Typography>
      <MyQr hint={BADGE_COPY.qrHint} token={me.data.profile.personalQrToken} />

      <AlertDialog open={congrats}>
        <AlertDialogContent data-testid="badge-issued-popup">
          <AlertDialogHeader>
            <AlertDialogTitle>Вам выдан значок! +1 балл</AlertDialogTitle>
            <AlertDialogDescription>Спасибо, что прошли активности форума.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction data-testid="badge-issued-ok" onClick={() => setCongrats(false)}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
