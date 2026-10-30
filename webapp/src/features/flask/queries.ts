import { queryOptions, useQuery } from '@tanstack/react-query'

import { sessionQueryKeys, useAuth } from '@/features/auth'
import { isScreenViewer } from '@/features/network'
import type { AuthenticatedTransport } from '@/platform/api'
import { getFlask } from './api'

const FLASK_POLL_MS = 3_000
/** While the server cannot be reached, ask less often. */
const FLASK_RETRY_MS = 15_000

function flaskQueryOptions(transport: AuthenticatedTransport) {
  return queryOptions({
    queryKey: [...sessionQueryKeys.all, 'flask'] as const,
    queryFn: ({ signal }) => getFlask(transport, { signal }),
    refetchInterval: (query) => (query.state.error ? FLASK_RETRY_MS : FLASK_POLL_MS),
    refetchIntervalInBackground: true,
    retry: false,
  })
}

export function useFlaskQuery() {
  const auth = useAuth()
  return useQuery({ ...flaskQueryOptions(auth.transport), enabled: isScreenViewer(auth.user?.role) })
}
