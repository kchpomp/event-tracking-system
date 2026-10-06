import type { UserDto } from '@event-tracking-system/contracts'

import { PageContainer, PageHeader } from '@/components/PageLayout'
import { AppearancePanel } from '@/features/settings'
import { ProfilePanel } from '@/features/users'
import { AdminMetrics } from './AdminMetrics'
import { UserDirectory } from './UserDirectory'

export function AdminDashboard() {
  return (
    <PageContainer>
      <PageHeader
        description="Сводка по аккаунтам и администраторам."
        title="Обзор"
      />
      <AdminMetrics />
    </PageContainer>
  )
}

export function AdminUsers({ currentUser }: { currentUser: UserDto }) {
  return (
    <PageContainer>
      <PageHeader
        description="Поиск аккаунтов и управление доступом. Пароли здесь не видны."
        title="Пользователи"
      />
      <UserDirectory currentUser={currentUser} />
    </PageContainer>
  )
}

export function AdminSettings({ user }: { user: UserDto }) {
  return (
    <PageContainer>
      <PageHeader
        description="Ваше имя администратора и оформление."
        title="Настройки"
      />
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <ProfilePanel user={user} />
        <AppearancePanel />
      </div>
    </PageContainer>
  )
}
