import type { UserRole } from '@event-tracking-system/contracts'
import { queryOptions, useQuery } from '@tanstack/react-query'

import { sessionQueryKeys, useAuth } from '@/features/auth'
import type { AuthenticatedTransport } from '@/platform/api'
import { getNetwork } from './api'

/** A scan reaches the screen within about five seconds. */
const NETWORK_POLL_MS = 4_000
/** While the server cannot be reached, ask less often: the refresh and the venue share budgets. */
const NETWORK_RETRY_MS = 15_000

// Under ['session', ...]: a session change removes it. The screen keeps its own copy of the
// picture, so the circles stay on the display while the session is being restored.
const networkQueryKeys = {
  snapshot: () => [...sessionQueryKeys.all, 'network'] as const,
}

function networkQueryOptions(transport: AuthenticatedTransport) {
  return queryOptions({
    queryKey: networkQueryKeys.snapshot(),
    queryFn: ({ signal }) => getNetwork(transport, { signal }),
    // The poll goes through the session transport, which refreshes an expired access token.
    refetchInterval: (query) => (query.state.error ? NETWORK_RETRY_MS : NETWORK_POLL_MS),
    // The screen runs unattended: keep polling when the window is not focused.
    refetchIntervalInBackground: true,
    // The interval is the retry; a failed poll must not burst three more requests.
    retry: false,
  })
}

/** Administrators and screen accounts may read the network; the endpoint is the same for both. */
export function isScreenViewer(role: UserRole | undefined) {
  return role === 'admin' || role === 'screen'
}

/** Polls only while such a user is signed in. */
export function useNetworkQuery() {
  const auth = useAuth()
  return useQuery({
    ...networkQueryOptions(auth.transport),
    enabled: isScreenViewer(auth.user?.role),
  })
}
