import type { UserRole } from '@event-tracking-system/contracts'

// Every path pattern registered under the role's workspace layout in `src/routes.tsx`, in TanStack
// syntax (`$param` segments). This is the return-path allow-list: a protected route survives the
// login round-trip whether or not the sidebar links to it. `tests/navigation.test.ts` fails when
// this table and the router drift apart.
export const workspaceRoutesByRole = {
  user: [
    '/app',
    '/app/scan',
    '/app/station/$stationId',
    '/app/diffusion',
    '/app/diffusion/scan',
    '/app/ideas',
    '/app/polymer',
    '/app/profile',
  ],
  admin: ['/admin', '/admin/participants', '/admin/users', '/admin/stations', '/admin/settings'],
  hostess: ['/hostess', '/hostess/scan', '/hostess/participant/$participantId'],
} as const satisfies Record<UserRole, ReadonlyArray<`/${string}`>>

type WorkspaceRouteTable = Record<UserRole, ReadonlyArray<string>>

// Concrete, parameter-free workspace paths: the only ones a sidebar link or a role home can target
// without params. A `$param` route belongs in the table above but never in these unions.
type StaticPath<T extends string> = T extends `${string}$${string}` ? never : T
export type UserRoutePath = StaticPath<(typeof workspaceRoutesByRole.user)[number]>
export type AdminRoutePath = StaticPath<(typeof workspaceRoutesByRole.admin)[number]>
export type WorkspaceRoutePath = UserRoutePath | AdminRoutePath

// The sidebar menu is a presentation subset of the workspace routes; the type keeps it one.
const navigationByRole = {
  // Participants have no sidebar (see ParticipantShell); the entry only keeps the table total.
  user: [
    { label: 'Главная', to: '/app' },
    { label: 'Профиль', to: '/app/profile' },
  ],
  admin: [
    { label: 'Обзор', to: '/admin' },
    { label: 'Участники', to: '/admin/participants' },
    { label: 'Пользователи', to: '/admin/users' },
    { label: 'Станции', to: '/admin/stations' },
    { label: 'Настройки', to: '/admin/settings' },
  ],
  // Hostesses, like participants, use the phone shell without a sidebar.
  hostess: [],
} as const satisfies Record<UserRole, ReadonlyArray<{ label: string; to: WorkspaceRoutePath }>>

export function navigationItemsForRole(role: UserRole) {
  return navigationByRole[role]
}

const homeByRole = {
  user: '/app',
  admin: '/admin',
  hostess: '/hostess',
} as const satisfies Record<UserRole, `/${string}`>

export function homePathForRole(role: UserRole) {
  return homeByRole[role]
}

export function resolveRoleDestination(role: UserRole, pathname: string): string {
  return isWorkspacePath(role, pathname) ? pathname : homePathForRole(role)
}

export function safeReturnPath(
  role: UserRole,
  value: string | undefined,
  routes: WorkspaceRouteTable = workspaceRoutesByRole,
): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null

  let url: URL
  try {
    url = new URL(value, 'https://app.invalid')
  } catch {
    return null
  }
  if (url.origin !== 'https://app.invalid') return null
  return isWorkspacePath(role, url.pathname, routes) ? `${url.pathname}${url.search}` : null
}

function isWorkspacePath(
  role: UserRole,
  pathname: string,
  routes: WorkspaceRouteTable = workspaceRoutesByRole,
): boolean {
  return routes[role].some((pattern) => matchesRoutePattern(pattern, pathname))
}

// A literal segment must match exactly; a named `$param` segment matches one non-empty segment.
// Route shapes this does not understand (a bare `$` splat, optional or prefixed params) never
// match, so such a return path falls back to the role home, which is the safe direction; extend
// the matcher when such a route is registered.
function matchesRoutePattern(pattern: string, pathname: string): boolean {
  const patternSegments = pattern.split('/')
  const pathSegments = pathname.split('/')
  if (patternSegments.length !== pathSegments.length) return false
  return patternSegments.every((segment, index) => {
    const actual = pathSegments[index] ?? ''
    const isNamedParam = segment.length > 1 && segment.startsWith('$')
    return isNamedParam ? actual !== '' : segment === actual
  })
}
