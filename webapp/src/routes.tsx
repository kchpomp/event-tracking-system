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

const userPolymerRoute = createRoute({
  getParentRoute: () => userWorkspaceRoute,
  path: '/app/polymer',
  component: lazyRouteComponent(() => import('./pages'), 'UserPolymerPage'),
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

const adminStationsRoute = createRoute({
  getParentRoute: () => adminWorkspaceRoute,
  path: '/admin/stations',
  component: lazyRouteComponent(() => import('./pages'), 'AdminStationsPage'),
})

const adminSettingsRoute = createRoute({
  getParentRoute: () => adminWorkspaceRoute,
  path: '/admin/settings',
  component: lazyRouteComponent(() => import('./pages'), 'AdminSettingsPage'),
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

const hostessParticipantRoute = createRoute({
  getParentRoute: () => hostessWorkspaceRoute,
  path: '/hostess/participant/$participantId',
  component: lazyRouteComponent(() => import('./pages'), 'HostessParticipantRoutePage'),
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  signupRoute,
  forgotPasswordRoute,
  resetPasswordRoute,
  userWorkspaceRoute.addChildren([
    userHomeRoute,
    userScanRoute,
    userStationRoute,
    userDiffusionRoute,
    userDiffusionScanRoute,
    userIdeasRoute,
    userPolymerRoute,
    userProfileRoute,
  ]),
  adminWorkspaceRoute.addChildren([
    adminDashboardRoute,
    adminUsersRoute,
    adminStationsRoute,
    adminSettingsRoute,
  ]),
  hostessWorkspaceRoute.addChildren([
    hostessHomeRoute,
    hostessScanRoute,
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
