export type FieldName =
  | 'city'
  | 'company'
  | 'confirmPassword'
  | 'displayName'
  | 'email'
  | 'firstName'
  | 'lastName'
  | 'password'
export type FormError = { message?: string }
export type FieldErrors = Partial<Record<FieldName, FormError[]>>
export type ValidationErrors = {
  fieldErrors: FieldErrors
  /** Issues no rendered field owns: root-level ones, or a field the form does not know about. */
  formError: string | null
}
