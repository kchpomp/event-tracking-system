import { useState } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useScheduleQuery } from './queries'
import { isLiveByOverride, minutesUntil, reminderKey, startingSoon } from './schedule-model'
import { useServerNow } from './use-server-now'

const STORAGE_KEY = 'schedule-reminders-seen'
const TICK_MS = 15_000

function readSeen(): Set<string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return new Set(Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [])
  } catch {
    return new Set()
  }
}

function writeSeen(seen: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen]))
  } catch {
    // No storage: the reminder is then once per page load, which is still fine.
  }
}

/**
 * Mounted once in the signed-in layout: a dialog when a team starts in 10 minutes or less. Each
 * team (and start time) is announced once per device; two teams at once share one dialog.
 */
export function SchedulePopup() {
  const query = useScheduleQuery()
  const now = useServerNow(
    query.data ? { serverNow: query.data.serverNow, fetchedAt: query.dataUpdatedAt } : null,
    TICK_MS,
  )
  const [seen, setSeen] = useState(readSeen)
  const live = query.data?.live
  const due =
    query.data && live
      ? startingSoon(query.data.teams, now).filter((team) => !seen.has(reminderKey(team)) && !isLiveByOverride(team, live))
      : []

  function acknowledge() {
    const next = new Set(seen)
    for (const team of due) next.add(reminderKey(team))
    writeSeen(next)
    setSeen(next)
  }

  return (
    <AlertDialog open={due.length > 0}>
      <AlertDialogContent data-testid="schedule-popup">
        <AlertDialogHeader>
          <AlertDialogTitle>{due.length > 1 ? 'Скоро выступят команды' : 'Скоро выступление'}</AlertDialogTitle>
          {due.map((team) => (
            <AlertDialogDescription key={team.id}>
              {`Команда «${team.name}» выступит через ${team.startsAt ? minutesUntil(team.startsAt, now) : 0} мин`}
            </AlertDialogDescription>
          ))}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction data-testid="schedule-popup-ok" onClick={() => acknowledge()}>
            OK
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
