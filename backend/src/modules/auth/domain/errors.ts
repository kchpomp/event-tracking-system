export type AuthFailureKind =
  | 'access_token_invalid'
  | 'access_token_required'
  | 'email_already_exists'
  | 'email_verification_invalid'
  | 'invalid_credentials'
  | 'invalid_reference'
  | 'login_locked'
  | 'password_reset_invalid'
  | 'provider_account_already_linked'
  | 'provider_email_required'
  | 'provider_invalid_token'
  | 'provider_not_configured'
  | 'provider_unavailable'
  | 'refresh_session_invalid'
  | 'refresh_token_required'
  | 'session_invalid'
  | 'social_email_already_exists'

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
