import { networkResponseSchema } from '@event-tracking-system/contracts'

import type { AuthenticatedTransport } from '@/platform/api'

/** Administrators only: every participant with initials and the connections between them. */
export function getNetwork(transport: AuthenticatedTransport, options: { signal?: AbortSignal } = {}) {
  return transport.request('/api/admin/network', networkResponseSchema, options)
}
