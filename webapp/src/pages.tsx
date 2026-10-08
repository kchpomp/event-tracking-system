import { Outlet, useLocation, useParams, useRouter, useSearch } from '@tanstack/react-router'
import type { UserDto, UserRole } from '@event-tracking-system/contracts'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import {
  NotFoundSection,
  SessionErrorSection,
  SessionLoadingSection,
} from '@/components/WebRouteSections'
import { ParticipantShell } from '@/components/ParticipantShell'
import { WorkspaceShell } from '@/components/WorkspaceShell'
import { AdminDashboard, AdminSettings, AdminUsers } from '@/features/admin'
import {
  AuthPageShell,
  clearPasswordResetTokenHash,
  ForgotPasswordForm,
  LoginForm,
  RegisterForm,
  readPasswordResetToken,
  ResetPasswordForm,
  useAuth,
} from '@/features/auth'
import {
  AdminStations,
  DiffusionPage,
  DiffusionScanPage,
  EventDashboard,
  HostessHomePage,
  HostessParticipantPage,
  HostessScanPage,
  IdeasPage,
  PolymerPage,
  ProfilePage,
  RegistrationClosed,
  StationPage,
  StationScanPage,
  useRegistrationStatusQuery,
} from '@/features/event'
import { homePathForRole, safeReturnPath } from '@/features/navigation'

export function HomePage() {
  const auth = useAuth()
  const { returnTo } = useSearch({ from: '/' })

  if (auth.isBootstrapping) return <SessionLoadingSection />
  if (auth.sessionError && !auth.user) {
    return <SessionErrorSection retry={auth.retrySession} />
  }
  if (auth.user) {
    return (
      <HrefRedirect
        href={safeReturnPath(auth.user.role, returnTo) ?? homePathForRole(auth.user.role)}
      />
    )
  }
  const destination = returnTo
    ? `/login?returnTo=${encodeURIComponent(returnTo)}`
    : '/login'
  return <HrefRedirect href={destination} />
}

export function LoginPage() {
  const { returnTo } = useSearch({ from: '/login' })
  return (
    <GuestAuthPage returnTo={returnTo}>
      <AuthPageShell>
        <LoginForm returnTo={returnTo} />
      </AuthPageShell>
    </GuestAuthPage>
  )
}

export function SignupPage() {
  const { returnTo } = useSearch({ from: '/signup' })
  const registration = useRegistrationStatusQuery()
  return (
    <GuestAuthPage returnTo={returnTo}>
      <AuthPageShell>
        {registration.data?.open === false ? (
          <RegistrationClosed />
        ) : (
          <RegisterForm returnTo={returnTo} />
        )}
      </AuthPageShell>
    </GuestAuthPage>
  )
}

export function ForgotPasswordPage() {
  return (
    <GuestAuthPage>
      <AuthPageShell>
        <ForgotPasswordForm />
      </AuthPageShell>
    </GuestAuthPage>
  )
}

export function ResetPasswordPage() {
  const auth = useAuth()
  const token = usePasswordResetToken()
  if (auth.isBootstrapping) return <SessionLoadingSection />

  return (
    <AuthPageShell>
      <ResetPasswordForm token={token} />
    </AuthPageShell>
  )
}

export function UserHomePage() {
  return <EventDashboard />
}

export function UserScanPage() {
  return <StationScanPage />
}

export function UserStationPage() {
  const { stationId } = useParams({ from: '/userWorkspace/app/station/$stationId' })
  return <StationPage stationId={stationId} />
}

export function UserDiffusionPage() {
  return <DiffusionPage />
}

export function UserDiffusionScanPage() {
  return <DiffusionScanPage />
}

export function UserIdeasPage() {
  return <IdeasPage />
}

export function UserPolymerPage() {
  return <PolymerPage />
}

export function UserProfilePage() {
  const user = useWorkspaceUser('user')
  return <ProfilePage user={user} />
}

export function HostessHomeRoutePage() {
  return <HostessHomePage />
}

export function HostessScanRoutePage() {
  return <HostessScanPage />
}

export function HostessParticipantRoutePage() {
  const { participantId } = useParams({
    from: '/hostessWorkspace/hostess/participant/$participantId',
  })
  return <HostessParticipantPage participantId={participantId} />
}

export function AdminStationsPage() {
  return <AdminStations />
}

export function AdminDashboardPage() {
  return <AdminDashboard />
}

export function AdminUsersPage() {
  const user = useWorkspaceUser('admin')
  return <AdminUsers currentUser={user} />
}

export function AdminSettingsPage() {
  const user = useWorkspaceUser('admin')
  return <AdminSettings user={user} />
}

export function UserWorkspaceLayout() {
  return <WorkspaceRoute role="user" />
}

export function AdminWorkspaceLayout() {
  return <WorkspaceRoute role="admin" />
}

export function HostessWorkspaceLayout() {
  return <WorkspaceRoute role="hostess" />
}

export function NotFoundPage() {
  const auth = useAuth()

  if (auth.isBootstrapping) return <SessionLoadingSection />
  if (auth.sessionError && !auth.user) {
    return <SessionErrorSection retry={auth.retrySession} />
  }

  const destination = auth.user ? homePathForRole(auth.user.role) : '/login'
  return <NotFoundSection destination={destination} />
}

function WorkspaceRoute({ role }: { role: UserRole }) {
  const auth = useAuth()
  const location = useLocation()

  if (auth.isBootstrapping) return <SessionLoadingSection />
  if (auth.sessionError && !auth.user) {
    return <SessionErrorSection retry={auth.retrySession} />
  }
  if (!auth.user) {
    const returnTo = `${location.pathname}${location.searchStr}`
    return <HrefRedirect href={`/login?returnTo=${encodeURIComponent(returnTo)}`} />
  }
  if (auth.user.role !== role) {
    return <HrefRedirect href={homePathForRole(auth.user.role)} />
  }

  // Participants and hostesses use their phones: one narrow column. Administrators keep the
  // sidebar workspace.
  if (auth.user.role === 'user') {
    return (
      <ParticipantShell onLogout={auth.logout}>
        <Outlet />
      </ParticipantShell>
    )
  }
  if (auth.user.role === 'hostess') {
    return (
      <ParticipantShell home="/hostess" onLogout={auth.logout} showProfile={false}>
        <Outlet />
      </ParticipantShell>
    )
  }

  return (
    <WorkspaceShell onLogout={auth.logout} user={auth.user}>
      <Outlet />
    </WorkspaceShell>
  )
}

function GuestAuthPage({
  children,
  returnTo,
}: {
  children: ReactNode
  returnTo?: string
}) {
  const auth = useAuth()

  if (auth.isBootstrapping) return <SessionLoadingSection />
  if (auth.sessionError && !auth.user) {
    return <SessionErrorSection retry={auth.retrySession} />
  }
  if (auth.user) {
    return (
      <HrefRedirect
        href={safeReturnPath(auth.user.role, returnTo) ?? homePathForRole(auth.user.role)}
      />
    )
  }

  return children
}

function usePasswordResetToken() {
  const [token, setToken] = useState(() => {
    if (typeof window === 'undefined') return ''
    return readPasswordResetToken(window.location)
  })

  useEffect(() => {
    const captureToken = () => {
      const nextToken = readPasswordResetToken(window.location)
      if (!nextToken) return
      setToken(nextToken)
      clearPasswordResetTokenHash(window.location, window.history)
    }

    captureToken()
    window.addEventListener('hashchange', captureToken)
    return () => window.removeEventListener('hashchange', captureToken)
  }, [])

  return token
}

function useWorkspaceUser(role: UserRole): UserDto {
  const user = useAuth().user
  if (!user || user.role !== role) {
    throw new Error(`${role} workspace page rendered outside its guarded layout`)
  }
  return user
}

function HrefRedirect({ href }: { href: string }) {
  const router = useRouter()
  const hasRedirected = useRef(false)
  useEffect(() => {
    if (hasRedirected.current) return
    hasRedirected.current = true
    router.history.replace(href)
  }, [href, router])
  return null
}
