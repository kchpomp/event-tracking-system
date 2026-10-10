import {
  UserGroupIcon,
  UserShield01Icon,
} from '@hugeicons/core-free-icons'

import { SectionCards } from '@/components/dashboard'
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAdminDashboardQuery } from './queries'

export function AdminMetrics() {
  const query = useAdminDashboardQuery()

  if (query.isPending) {
    return (
      <div
        aria-label="Загрузка обзора"
        className="grid grid-cols-1 gap-4 md:grid-cols-2"
        role="status"
      >
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    )
  }

  if (query.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Обзор недоступен</AlertTitle>
        <AlertDescription>{query.error.message}</AlertDescription>
        <AlertAction>
          <Button onClick={() => void query.refetch()} size="sm" type="button" variant="outline">
            Повторить
          </Button>
        </AlertAction>
      </Alert>
    )
  }

  return (
    <SectionCards
      items={[
        {
          description: 'Все зарегистрированные аккаунты.',
          icon: UserGroupIcon,
          label: 'Всего пользователей',
          value: query.data.totalUsers.toLocaleString(),
        },
        {
          description: 'Аккаунты с правами администратора.',
          icon: UserShield01Icon,
          label: 'Администраторы',
          value: query.data.totalAdmins.toLocaleString(),
        },
      ]}
    />
  )
}
