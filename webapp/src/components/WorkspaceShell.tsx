import {
  DashboardSquare01Icon,
  Home01Icon,
  QrCodeIcon,
  Settings01Icon,
  UserGroupIcon,
  UserListIcon,
  UserIcon,
} from '@hugeicons/core-free-icons'
import { useLocation } from '@tanstack/react-router'
import type { UserDto } from '@event-tracking-system/contracts'
import type { PropsWithChildren } from 'react'

import {
  AppSidebar,
  type DashboardNavigationItem,
  SiteHeader,
} from '@/components/dashboard'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { navigationItemsForRole } from '@/features/navigation'

const iconsByPath = {
  '/app': Home01Icon,
  '/app/profile': UserIcon,
  '/admin': DashboardSquare01Icon,
  '/admin/participants': UserListIcon,
  '/admin/users': UserGroupIcon,
  '/admin/stations': QrCodeIcon,
  '/admin/settings': Settings01Icon,
} as const

function getSidebarDefaultOpen() {
  const persistedState = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith('sidebar_state='))
    ?.slice('sidebar_state='.length)

  return persistedState !== 'false'
}

export function WorkspaceShell({
  children,
  onLogout,
  user,
}: PropsWithChildren<{
  onLogout: () => Promise<void>
  user: UserDto
}>) {
  const pathname = useLocation({ select: (location) => location.pathname })
  const navigationItems = navigationItemsForRole(user.role)
  const activeItem = navigationItems.find((item) => item.to === pathname)
  // Only administrators use this shell; participants and hostesses have ParticipantShell.
  const homePath = '/admin'
  const settingsPath = '/admin/settings'
  const items: ReadonlyArray<DashboardNavigationItem> = navigationItems.map((item) => ({
    ...item,
    icon: iconsByPath[item.to],
    isActive: item.to === pathname,
  }))

  return (
    <SidebarProvider defaultOpen={getSidebarDefaultOpen()}>
      <AppSidebar
        accountPath={user.role === 'user' ? '/app/profile' : undefined}
        homePath={homePath}
        items={items}
        onLogout={onLogout}
        settingsPath={settingsPath}
        user={user}
        workspaceLabel="Администратор"
      />
      <SidebarInset>
        <SiteHeader
          title={activeItem?.label ?? 'Обзор'}
        />
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
