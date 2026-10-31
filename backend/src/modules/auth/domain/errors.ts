export type AuthFailureKind =
  | 'access_token_invalid'
  | 'access_token_required'
  | 'email_already_exists'
  | 'email_verification_invalid'
  | 'invalid_credentials'
  | 'invalid_reference'
  | 'login_locked'
  | 'password_reset_invalid'
  | 'refresh_session_invalid'
  | 'refresh_token_required'
  | 'session_invalid'

export class AuthFailure extends Error {
  constructor(
    public readonly kind: AuthFailureKind,
    message: string,
    /** Only for `login_locked`: seconds until the failure window ends. */
    public readonly retryAfterSeconds?: number,
  ) {
    super(message)
  }
}
