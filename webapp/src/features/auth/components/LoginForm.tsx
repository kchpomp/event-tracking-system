import { useForm } from '@tanstack/react-form'
import { Link } from '@tanstack/react-router'
import { loginRequestSchema, type LoginRequest } from '@event-tracking-system/contracts'
import { useId, useState } from 'react'

import { Typography } from '@/components/typography'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { authErrorMessage } from '../auth-errors'
import { useAuth } from '../use-auth'
import { FormAlert } from './form-errors'
import type { FieldErrors } from './form-model'
import { clearFieldError, errorId, hasErrors, toValidationErrors } from './form-validation'
import { PasswordInput } from './PasswordInput'

export function LoginForm({ returnTo }: { returnTo?: string }) {
  const auth = useAuth()
  const emailId = useId()
  const emailErrorId = useId()
  const passwordId = useId()
  const passwordErrorId = useId()
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm({
    defaultValues: { email: '', password: '' },
    onSubmit: async ({ value }) => {
      setFormError(null)
      const result = loginRequestSchema.safeParse(value)
      if (!result.success) {
        const validation = toValidationErrors(result.error.issues)
        setFieldErrors(validation.fieldErrors)
        setFormError(validation.formError)
        return
      }

      setFieldErrors({})
      try {
        await auth.login(result.data as LoginRequest)
      } catch (caughtError) {
        setFormError(authErrorMessage(caughtError, 'login'))
      }
    },
  })

  return (
    <form
      className="flex flex-col gap-6"
      data-testid="login-form"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <FieldGroup className="gap-5">
        <div className="flex flex-col gap-1">
          <Typography as="h1" variant="h3" balance>
            Вход
          </Typography>
          <Typography variant="bodySm" tone="muted" balance>
            Введите email и пароль, чтобы войти
          </Typography>
        </div>

        <form.Field
          name="email"
          children={(field) => (
            <Field data-invalid={hasErrors(fieldErrors.email)}>
              <FieldLabel htmlFor={emailId}>Email</FieldLabel>
              <Input
                aria-describedby={errorId(fieldErrors.email, emailErrorId)}
                aria-invalid={hasErrors(fieldErrors.email)}
                autoCapitalize="off"
                autoComplete="username"
                autoCorrect="off"
                className="bg-background"
                data-testid="login-email"
                id={emailId}
                inputMode="email"
                name={field.name}
                onBlur={field.handleBlur}
                onChange={(event) => {
                  field.handleChange(event.target.value)
                  clearFieldError('email', setFieldErrors)
                  setFormError(null)
                }}
                placeholder="вы@email.com"
                spellCheck={false}
                type="email"
                value={field.state.value}
              />
              <FieldError id={emailErrorId} errors={fieldErrors.email} />
            </Field>
          )}
        />

        <form.Field
          name="password"
          children={(field) => (
            <Field data-invalid={hasErrors(fieldErrors.password)}>
              <div className="flex items-center">
                <FieldLabel htmlFor={passwordId}>Пароль</FieldLabel>
                <Typography asChild variant="bodySm">
                  <Link
                    className="ml-auto underline-offset-4 hover:underline"
                    data-testid="forgot-password-link"
                    to="/forgot-password"
                  >
                    Забыли пароль?
                  </Link>
                </Typography>
              </div>
              <PasswordInput
                aria-describedby={errorId(fieldErrors.password, passwordErrorId)}
                aria-invalid={hasErrors(fieldErrors.password)}
                autoComplete="current-password"
                className="bg-background"
                data-testid="login-password"
                enterKeyHint="go"
                id={passwordId}
                name={field.name}
                onBlur={field.handleBlur}
                onChange={(event) => {
                  field.handleChange(event.target.value)
                  clearFieldError('password', setFieldErrors)
                  setFormError(null)
                }}
                value={field.state.value}
              />
              <FieldError id={passwordErrorId} errors={fieldErrors.password} />
            </Field>
          )}
        />

        <FormAlert message={formError} title="Не удалось войти" />

        <Field>
          <form.Subscribe
            selector={(state) => state.isSubmitting}
            children={(isSubmitting) => (
              <Button
                className="h-11"
                data-testid="login-submit"
                disabled={isSubmitting}
                size="lg"
                type="submit"
              >
                {isSubmitting ? 'Выполняется вход…' : 'Войти'}
              </Button>
            )}
          />
        </Field>

        <FieldDescription>
          Нет аккаунта?{' '}
          <Link data-testid="signup-link" search={{ returnTo }} to="/signup">
            Зарегистрироваться
          </Link>
        </FieldDescription>
      </FieldGroup>
    </form>
  )
}
