import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from '@tanstack/react-router'

import { RootLayout } from './root-layout'

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: lazyRouteComponent(() => import('./pages'), 'NotFoundPage'),
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: (search: Record<string, unknown>) => ({
    returnTo: typeof search.returnTo === 'string' ? search.returnTo : undefined,
  }),
  component: lazyRouteComponent(() => import('./pages'), 'HomePage'),
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: returnToSearch,
  component: lazyRouteComponent(() => import('./pages'), 'LoginPage'),
})

const signupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/signup',
  validateSearch: returnToSearch,
  component: lazyRouteComponent(() => import('./pages'), 'SignupPage'),
})

const forgotPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/forgot-password',
  component: lazyRouteComponent(() => import('./pages'), 'ForgotPasswordPage'),
})

const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reset-password',
  component: lazyRouteComponent(() => import('./pages'), 'ResetPasswordPage'),
})

const verifyEmailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/verify-email',
  component: lazyRouteComponent(() => import('./pages'), 'VerifyEmailPage'),
})

const userWorkspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'userWorkspace',
  component: lazyRouteComponent(() => import('./pages'), 'UserWorkspaceLayout'),
})

const userHomeRoute = createRoute({
  getParentRoute: () => userWorkspaceRoute,
  path: '/app',
  component: lazyRouteComponent(() => import('./pages'), 'UserHomePage'),
})

const userProfileRoute = createRoute({
  getParentRoute: () => userWorkspaceRoute,
  path: '/app/profile',
  component: lazyRouteComponent(() => import('./pages'), 'UserProfilePage'),
})

const userScanRoute = createRoute({
  getParentRoute: () => userWorkspaceRoute,
  path: '/app/scan',
  component: lazyRouteComponent(() => import('./pages'), 'UserScanPage'),
})

const userStationRoute = createRoute({
  getParentRoute: () => userWorkspaceRoute,
  path: '/app/station/$stationId',
  component: lazyRouteComponent(() => import('./pages'), 'UserStationPage'),
})

const userDiffusionRoute = createRoute({
  getParentRoute: () => userWorkspaceRoute,
  path: '/app/diffusion',
  component: lazyRouteComponent(() => import('./pages'), 'UserDiffusionPage'),
})

const userDiffusionScanRoute = createRoute({
  getParentRoute: () => userWorkspaceRoute,
  path: '/app/diffusion/scan',
  component: lazyRouteComponent(() => import('./pages'), 'UserDiffusionScanPage'),
})

const userIdeasRoute = createRoute({
  getParentRoute: () => userWorkspaceRoute,
  path: '/app/ideas',
  component: lazyRouteComponent(() => import('./pages'), 'UserIdeasPage'),
})

const userScheduleRoute = createRoute({
  getParentRoute: () => userWorkspaceRoute,
  path: '/app/schedule',
  component: lazyRouteComponent(() => import('./pages'), 'UserSchedulePage'),
})

const userPolymerRoute = createRoute({
  getParentRoute: () => userWorkspaceRoute,
  path: '/app/polymer',
  component: lazyRouteComponent(() => import('./pages'), 'UserPolymerPage'),
})

const userBadgeRoute = createRoute({
  getParentRoute: () => userWorkspaceRoute,
  path: '/app/badge',
  component: lazyRouteComponent(() => import('./pages'), 'UserBadgePage'),
})

const adminWorkspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'adminWorkspace',
  component: lazyRouteComponent(() => import('./pages'), 'AdminWorkspaceLayout'),
})

const adminDashboardRoute = createRoute({
  getParentRoute: () => adminWorkspaceRoute,
  path: '/admin',
  component: lazyRouteComponent(() => import('./pages'), 'AdminDashboardPage'),
})

const adminUsersRoute = createRoute({
  getParentRoute: () => adminWorkspaceRoute,
  path: '/admin/users',
  component: lazyRouteComponent(() => import('./pages'), 'AdminUsersPage'),
})

const adminParticipantsRoute = createRoute({
  getParentRoute: () => adminWorkspaceRoute,
  path: '/admin/participants',
  component: lazyRouteComponent(() => import('./pages'), 'AdminParticipantsPage'),
})

const adminStationsRoute = createRoute({
  getParentRoute: () => adminWorkspaceRoute,
  path: '/admin/stations',
  component: lazyRouteComponent(() => import('./pages'), 'AdminStationsPage'),
})

const adminScheduleRoute = createRoute({
  getParentRoute: () => adminWorkspaceRoute,
  path: '/admin/schedule',
  component: lazyRouteComponent(() => import('./pages'), 'AdminSchedulePage'),
})

const adminSettingsRoute = createRoute({
  getParentRoute: () => adminWorkspaceRoute,
  path: '/admin/settings',
  component: lazyRouteComponent(() => import('./pages'), 'AdminSettingsPage'),
})

const adminScreenRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'adminScreen',
  component: lazyRouteComponent(() => import('./pages'), 'AdminScreenLayout'),
})

const adminNetworkRoute = createRoute({
  getParentRoute: () => adminScreenRoute,
  path: '/admin/network',
  component: lazyRouteComponent(() => import('./pages'), 'AdminNetworkPage'),
})

const adminFlaskRoute = createRoute({
  getParentRoute: () => adminScreenRoute,
  path: '/admin/flask',
  component: lazyRouteComponent(() => import('./pages'), 'AdminFlaskPage'),
})

const hostessWorkspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'hostessWorkspace',
  component: lazyRouteComponent(() => import('./pages'), 'HostessWorkspaceLayout'),
})

const hostessHomeRoute = createRoute({
  getParentRoute: () => hostessWorkspaceRoute,
  path: '/hostess',
  component: lazyRouteComponent(() => import('./pages'), 'HostessHomeRoutePage'),
})

const hostessScanRoute = createRoute({
  getParentRoute: () => hostessWorkspaceRoute,
  path: '/hostess/scan',
  component: lazyRouteComponent(() => import('./pages'), 'HostessScanRoutePage'),
})

const hostessBadgeRoute = createRoute({
  getParentRoute: () => hostessWorkspaceRoute,
  path: '/hostess/badge',
  component: lazyRouteComponent(() => import('./pages'), 'HostessBadgeRoutePage'),
})

const hostessParticipantRoute = createRoute({
  getParentRoute: () => hostessWorkspaceRoute,
  path: '/hostess/participant/$participantId',
  component: lazyRouteComponent(() => import('./pages'), 'HostessParticipantRoutePage'),
})

const screenWorkspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'screenWorkspace',
  component: lazyRouteComponent(() => import('./pages'), 'ScreenWorkspaceLayout'),
})

const screenHomeRoute = createRoute({
  getParentRoute: () => screenWorkspaceRoute,
  path: '/screen',
  component: lazyRouteComponent(() => import('./pages'), 'ScreenPage'),
})

const screenNetworkRoute = createRoute({
  getParentRoute: () => screenWorkspaceRoute,
  path: '/screen/network',
  component: lazyRouteComponent(() => import('./pages'), 'ScreenNetworkPage'),
})

const screenFlaskRoute = createRoute({
  getParentRoute: () => screenWorkspaceRoute,
  path: '/screen/flask',
  component: lazyRouteComponent(() => import('./pages'), 'ScreenFlaskPage'),
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  signupRoute,
  forgotPasswordRoute,
  resetPasswordRoute,
  verifyEmailRoute,
  userWorkspaceRoute.addChildren([
    userHomeRoute,
    userScanRoute,
    userStationRoute,
    userDiffusionRoute,
    userDiffusionScanRoute,
    userIdeasRoute,
    userScheduleRoute,
    userPolymerRoute,
    userBadgeRoute,
    userProfileRoute,
  ]),
  adminWorkspaceRoute.addChildren([
    adminDashboardRoute,
    adminParticipantsRoute,
    adminUsersRoute,
    adminStationsRoute,
    adminScheduleRoute,
    adminSettingsRoute,
  ]),
  adminScreenRoute.addChildren([adminNetworkRoute, adminFlaskRoute]),
  screenWorkspaceRoute.addChildren([screenHomeRoute, screenNetworkRoute, screenFlaskRoute]),
  hostessWorkspaceRoute.addChildren([
    hostessHomeRoute,
    hostessScanRoute,
    hostessBadgeRoute,
    hostessParticipantRoute,
  ]),
])

export const router = createRouter({ routeTree })

function returnToSearch(search: Record<string, unknown>) {
  return {
    returnTo: typeof search.returnTo === 'string' ? search.returnTo : undefined,
  }
}

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
