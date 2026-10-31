import { Outlet, useLocation, useParams, useRouter, useSearch } from '@tanstack/react-router'
import type { UserDto, UserRole } from '@event-tracking-system/contracts'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import {
  NotFoundSection,
  SessionErrorSection,
  SessionLoadingSection,
} from '@/components/WebRouteSections'
import { ParticipantShell } from '@/components/ParticipantShell'
import { Typography } from '@/components/typography'
import { Button } from '@/components/ui/button'
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
  VerifyEmail,
} from '@/features/auth'
import {
  AdminSchedule,
  AdminStations,
  BadgePage,
  DiffusionPage,
  DiffusionScanPage,
  EventDashboard,
  HostessHomePage,
  HostessParticipantPage,
  HostessScanPage,
  IdeasPage,
  PlannedOverview,
  PlannedParticipantsPage,
  HostessBadgePage,
  PolymerPage,
  ProfilePage,
  RegistrationClosed,
  SchedulePage,
  SchedulePopup,
  StationPage,
  StationScanPage,
  useRegistrationReferenceQuery,
  useRegistrationStatusQuery,
} from '@/features/event'
import { homePathForRole, safeReturnPath } from '@/features/navigation'
import { FlaskScreen } from '@/features/flask'
import { NetworkScreen } from '@/features/network'
import { ScreenControls, ScreenMenu } from '@/features/screen'

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
  const reference = useRegistrationReferenceQuery()
  return (
    <GuestAuthPage returnTo={returnTo}>
      <AuthPageShell>
        {registration.data?.open === false ? (
          <RegistrationClosed />
        ) : reference.data ? (
          <RegisterForm
            cities={reference.data.cities}
            companies={reference.data.companies}
            returnTo={returnTo}
          />
        ) : reference.isError ? (
          <div className="flex flex-col items-start gap-3" data-testid="signup-reference-error">
            <Typography tone="muted" variant="bodySm">
              Не удалось загрузить списки предприятий и городов.
            </Typography>
            <Button onClick={() => void reference.refetch()} type="button">
              Повторить
            </Button>
          </div>
        ) : (
          <Typography tone="muted" variant="bodySm">
            Загрузка…
          </Typography>
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
  const token = useLinkToken()
  if (auth.isBootstrapping) return <SessionLoadingSection />

  return (
    <AuthPageShell>
      <ResetPasswordForm token={token} />
    </AuthPageShell>
  )
}

/** The emailed verification link; works signed in or not. */
export function VerifyEmailPage() {
  const token = useLinkToken()
  return (
    <AuthPageShell>
      <VerifyEmail key={token} token={token} />
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

export function UserBadgePage() {
  return <BadgePage />
}

export function UserSchedulePage() {
  return <SchedulePage />
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

export function HostessBadgeRoutePage() {
  return <HostessBadgePage />
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

export function AdminSchedulePage() {
  return <AdminSchedule />
}

export function AdminDashboardPage() {
  return <AdminDashboard participants={<PlannedOverview />} />
}

export function AdminParticipantsPage() {
  return <PlannedParticipantsPage />
}

export function AdminUsersPage() {
  const user = useWorkspaceUser('admin')
  return <AdminUsers currentUser={user} />
}

export function AdminSettingsPage() {
  const user = useWorkspaceUser('admin')
  return <AdminSettings user={user} />
}

export function AdminNetworkPage() {
  return <NetworkScreen />
}

export function AdminFlaskPage() {
  return <FlaskScreen />
}

export function ScreenFlaskPage() {
  return <FlaskScreen />
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

/** Administrator pages for the venue display: full screen, without the workspace sidebar. */
export function AdminScreenLayout() {
  return <VenueScreenRoute role="admin" />
}

/** The venue display account: the visualization alone, with a small sign-out in the corner. */
export function ScreenWorkspaceLayout() {
  return <VenueScreenRoute role="screen" />
}

export function ScreenPage() {
  return <ScreenMenu onLogout={useDisplayLogout()} />
}

export function ScreenNetworkPage() {
  return <NetworkScreen />
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
        <SchedulePopup />
      </ParticipantShell>
    )
  }
  if (auth.user.role === 'hostess') {
    return (
      <ParticipantShell home="/hostess" onLogout={auth.logout} showProfile={false}>
        <Outlet />
        <SchedulePopup />
      </ParticipantShell>
    )
  }

  return (
    <WorkspaceShell onLogout={auth.logout} user={auth.user}>
      <Outlet />
    </WorkspaceShell>
  )
}

/**
 * The same guard as the admin workspace, without its shell. Once the screen has been shown it
 * stays mounted when the session is lost, so the display keeps its last picture (the screen
 * marks it) instead of jumping to the sign-in form; signing in again in any tab resumes it.
 */
/**
 * Signing out of the display account must leave the screen. The venue route keeps the last picture
 * when a session is merely lost, so after a sign-out the person asked for it goes to the form itself.
 */
function useDisplayLogout() {
  const { logout } = useAuth()
  const router = useRouter()
  return async () => {
    await logout()
    router.history.replace('/login')
  }
}

function VenueScreenRoute({ role }: { role: 'admin' | 'screen' }) {
  const auth = useAuth()
  const location = useLocation()
  const allowed = auth.user?.role === role
  const [shown, setShown] = useState(false)
  const displayLogout = useDisplayLogout()
  const logout = role === 'screen' ? displayLogout : null
  if (allowed && !shown) setShown(true)

  if (shown && (allowed || !auth.user)) return <ScreenFrame logout={logout} role={role} />
  if (auth.isBootstrapping) return <SessionLoadingSection />
  if (auth.sessionError && !auth.user) {
    return <SessionErrorSection retry={auth.retrySession} />
  }
  if (!auth.user) {
    const returnTo = `${location.pathname}${location.searchStr}`
    return <HrefRedirect href={`/login?returnTo=${encodeURIComponent(returnTo)}`} />
  }
  if (!allowed) return <HrefRedirect href={homePathForRole(auth.user.role)} />
  return <ScreenFrame logout={logout} role={role} />
}

function ScreenFrame({ role, logout }: { role: 'admin' | 'screen'; logout: (() => Promise<void>) | null }) {
  const { pathname } = useLocation()
  // The display account's menu has its own buttons; every visualization gets small ones on hover.
  return (
    <>
      <Outlet />
      {pathname !== '/screen' && (
        <ScreenControls
          back={role === 'screen' ? { to: '/screen', label: 'К выбору экрана' } : { to: '/admin', label: 'В админку' }}
          onLogout={logout}
        />
      )}
    </>
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

/** The `#token=` of an emailed link, read once and then removed from the address bar. */
function useLinkToken() {
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
