import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  emailVerificationConfirmRequestSchema,
  emailVerificationRequestResponseSchema,
  type EmailVerificationConfirmRequest,
} from '@event-tracking-system/contracts'

import { HttpClient } from '@/platform/api'
import { authQueryKeys } from './queries'
import { useAuth } from './use-auth'

/** Sends the signed-in person a verification link. */
export function useRequestEmailVerificationMutation() {
  const auth = useAuth()
  return useMutation({
    mutationFn: () =>
      auth.transport.request(
        '/api/auth/email-verification/request',
        emailVerificationRequestResponseSchema,
        { method: 'POST' },
      ),
  })
}

/** Uses the link's token. Public: the link may be opened in a browser that is not signed in. */
export function useConfirmEmailVerificationMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: EmailVerificationConfirmRequest) => {
      await new HttpClient().raw('/api/auth/email-verification/confirm', {
        method: 'POST',
        body: emailVerificationConfirmRequestSchema.parse(input),
      })
    },
    // A signed-in session in this browser shows the new state at once.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: authQueryKeys.me() }),
  })
}

export function isEmailVerificationToken(token: string) {
  return emailVerificationConfirmRequestSchema.shape.token.safeParse(token).success
}
