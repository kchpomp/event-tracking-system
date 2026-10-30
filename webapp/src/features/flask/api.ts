import { flaskResponseSchema } from '@event-tracking-system/contracts'

import type { AuthenticatedTransport } from '@/platform/api'

/** Administrators and screen accounts: who dropped the latest ideas, never what they say. */
export function getFlask(transport: AuthenticatedTransport, options: { signal?: AbortSignal } = {}) {
  return transport.request('/api/admin/flask', flaskResponseSchema, options)
}
