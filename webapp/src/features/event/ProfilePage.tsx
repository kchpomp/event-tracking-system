import type { UserDto } from '@event-tracking-system/contracts'

import { Typography } from '@/components/typography'
import { Card, CardContent } from '@/components/ui/card'
import { ActivityHead, LoadErrorState, LoadingState } from './parts'
import { useEventMeQuery } from './queries'

/** Read-only: the name is public on the leaderboard, so participants cannot change it. */
export function ProfilePage({ user }: { user: Pick<UserDto, 'email'> }) {
  const me = useEventMeQuery()
  if (me.isPending) return <LoadingState />
  if (me.isError) return <LoadErrorState onRetry={() => void me.refetch()} />

  const { profile } = me.data
  // The email comes from the signed-in session. The account id is deliberately not shown.
  const rows: Array<[key: string, label: string, value: string | null]> = [
    ['firstName', 'Имя Участника', profile.firstName],
    ['lastName', 'Фамилия Участника', profile.lastName],
    ['company', 'Подразделение', profile.company],
    ['city', 'Город', profile.city],
    ['email', 'Email', user.email],
  ]

  return (
    <div className="grid gap-6">
      <ActivityHead title="Профиль" />
      <Card>
        <CardContent>
          <dl className="grid gap-4">
            {rows.map(([key, label, value]) => (
              <div className="grid gap-1" key={key}>
                <Typography as="dt" tone="muted" variant="captionMedium">
                  {label}
                </Typography>
                <Typography as="dd" data-testid={`profile-${key}`} variant="bodySmMedium" wrap="break">
                  {value || '—'}
                </Typography>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}
