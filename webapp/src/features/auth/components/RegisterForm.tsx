import { Link } from '@tanstack/react-router'
import { registerRequestSchema, type RegisterRequest } from '@event-tracking-system/contracts'
import { useId, useState } from 'react'

import { Typography } from '@/components/typography'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { authErrorMessage } from '../auth-errors'
import { CONSENT_TEXT } from '../consent-text'
import { PRIVACY_TEXT } from '../privacy-text'
import { useAuth } from '../use-auth'
import { ConsentDialog } from './ConsentDialog'
import { FormAlert } from './form-errors'
import type { FieldErrors } from './form-model'
import { clearFieldError, errorId, hasErrors, toValidationErrors } from './form-validation'
import { PasswordInput } from './PasswordInput'

// These two sentences are the product's own wording: do not reword them.
const MSG_REQUIRED = 'Не все обязательные поля заполнены'
const MSG_CONSENT = 'Не получено соглашение на обработку персональных данных'
const MSG_PRIVACY = 'Не подтверждено ознакомление с Политикой конфиденциальности'

// The two required ticks, checked in this order. `key` also names the test ids (`signup-<key>`, `<key>-link`).
const LEGAL = [
  { key: 'consent', label: 'Я принимаю условия обработки персональных данных', text: CONSENT_TEXT, message: MSG_CONSENT },
  { key: 'privacy', label: 'Я ознакомлен(а) с Политикой конфиденциальности', text: PRIVACY_TEXT, message: MSG_PRIVACY },
] as const
type LegalKey = (typeof LEGAL)[number]['key']

const TEXT_FIELDS = [
  { key: 'email', label: 'Email', autoComplete: 'email', max: 254, placeholder: 'вы@email.com' },
  { key: 'firstName', label: 'Имя', autoComplete: 'given-name', max: 100 },
  { key: 'lastName', label: 'Фамилия', autoComplete: 'family-name', max: 100 },
  { key: 'company', label: 'Предприятие / подразделение', autoComplete: 'organization', max: 100 },
  { key: 'city', label: 'Город', autoComplete: 'address-level2', max: 100 },
] as const

type TextKey = (typeof TEXT_FIELDS)[number]['key']
type Values = Record<TextKey | 'password', string>
const EMPTY: Values = { email: '', firstName: '', lastName: '', company: '', city: '', password: '' }

type Notice = { message: string; focusId: string }

export function RegisterForm({ returnTo }: { returnTo?: string }) {
  const auth = useAuth()
  const baseId = useId()
  const idOf = (key: string) => `${baseId}-${key}`
  const [values, setValues] = useState<Values>(EMPTY)
  const [agreed, setAgreed] = useState({ consent: false, privacy: false })
  const [legalOpen, setLegalOpen] = useState<LegalKey | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [missing, setMissing] = useState<ReadonlySet<string>>(new Set())
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function change(key: keyof Values, value: string) {
    setValues((current) => ({ ...current, [key]: value }))
    setMissing((current) => {
      if (!current.has(key)) return current
      const next = new Set(current)
      next.delete(key)
      return next
    })
    if (key === 'email' || key === 'password') clearFieldError(key, setFieldErrors)
    setFormError(null)
  }

  async function submit() {
    // «Присоединиться» is never disabled; it checks in this order and stops at the first failure.
    const empty = [...TEXT_FIELDS.map((field) => field.key), 'password' as const].filter(
      (key) => values[key].trim() === '',
    )
    if (empty.length > 0) {
      setMissing(new Set(empty))
      setNotice({ message: MSG_REQUIRED, focusId: idOf(empty[0]!) })
      return
    }
    const unticked = LEGAL.find(({ key }) => !agreed[key])
    if (unticked) {
      setNotice({ message: unticked.message, focusId: idOf(unticked.key) })
      return
    }

    const result = registerRequestSchema.safeParse({ ...values, consent: true, privacyPolicy: true })
    if (!result.success) {
      const validation = toValidationErrors(result.error.issues)
      setFieldErrors(validation.fieldErrors)
      setFormError(validation.formError)
      return
    }

    setFieldErrors({})
    setFormError(null)
    setPending(true)
    try {
      await auth.register(result.data as RegisterRequest)
    } catch (caught) {
      setFormError(authErrorMessage(caught, 'register'))
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <form
        className="flex flex-col gap-6"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <FieldGroup className="gap-5">
          <div className="flex flex-col items-center gap-1 text-center">
            <Typography as="h1" balance variant="h3">
              Регистрация
            </Typography>
            <Typography balance tone="muted" variant="bodySm">
              Создайте аккаунт участника
            </Typography>
          </div>

          {TEXT_FIELDS.map((field) => {
            const invalid =
              missing.has(field.key) || (field.key === 'email' && hasErrors(fieldErrors.email))
            return (
              <Field data-invalid={invalid} key={field.key}>
                <FieldLabel htmlFor={idOf(field.key)}>{field.label} *</FieldLabel>
                <Input
                  aria-describedby={
                    field.key === 'email' ? errorId(fieldErrors.email, idOf('email-error')) : undefined
                  }
                  aria-invalid={invalid}
                  autoCapitalize={field.key === 'email' ? 'off' : undefined}
                  autoComplete={field.autoComplete}
                  autoCorrect="off"
                  className="bg-background"
                  data-testid={`signup-${field.key}`}
                  id={idOf(field.key)}
                  inputMode={field.key === 'email' ? 'email' : undefined}
                  maxLength={field.max}
                  onChange={(event) => change(field.key, event.target.value)}
                  placeholder={'placeholder' in field ? field.placeholder : undefined}
                  spellCheck={false}
                  type={field.key === 'email' ? 'email' : 'text'}
                  value={values[field.key]}
                />
                {field.key === 'email' && (
                  <FieldError errors={fieldErrors.email} id={idOf('email-error')} />
                )}
              </Field>
            )
          })}

          <Field data-invalid={missing.has('password') || hasErrors(fieldErrors.password)}>
            <FieldLabel htmlFor={idOf('password')}>Пароль *</FieldLabel>
            <PasswordInput
              aria-describedby={[
                idOf('password-hint'),
                errorId(fieldErrors.password, idOf('password-error')),
              ]
                .filter(Boolean)
                .join(' ')}
              aria-invalid={missing.has('password') || hasErrors(fieldErrors.password)}
              autoComplete="new-password"
              className="bg-background"
              data-testid="signup-password"
              id={idOf('password')}
              maxLength={128}
              onChange={(event) => change('password', event.target.value)}
              value={values.password}
            />
            <FieldDescription id={idOf('password-hint')}>Не менее 8 символов.</FieldDescription>
            <FieldError errors={fieldErrors.password} id={idOf('password-error')} />
          </Field>

          {LEGAL.map(({ key, label }) => (
            <div className="flex items-center gap-3" key={key}>
              <Checkbox
                aria-label={label}
                checked={agreed[key]}
                data-testid={`signup-${key}`}
                id={idOf(key)}
                onCheckedChange={(checked) => setAgreed((current) => ({ ...current, [key]: checked === true }))}
              />
              <Button
                className="h-auto min-h-11 min-w-0 shrink justify-start px-0 text-left whitespace-normal"
                data-testid={`${key}-link`}
                onClick={() => setLegalOpen(key)}
                type="button"
                variant="link"
              >
                {label}
              </Button>
            </div>
          ))}

          <FormAlert message={formError} title="Не удалось зарегистрироваться" />

          <Field>
            <Button className="h-11" data-testid="signup-submit" disabled={pending} size="lg" type="submit">
              {pending ? 'Регистрация…' : 'Присоединиться'}
            </Button>
          </Field>

          <FieldDescription className="text-center">
            Уже есть аккаунт?{' '}
            <Link search={{ returnTo }} to="/login">
              Войти
            </Link>
          </FieldDescription>
        </FieldGroup>
      </form>

      {LEGAL.map(({ key, text }) => (
        <ConsentDialog
          key={key}
          onAgree={() => {
            setAgreed((current) => ({ ...current, [key]: true }))
            setLegalOpen(null)
          }}
          onOpenChange={(open) => setLegalOpen(open ? key : null)}
          open={legalOpen === key}
          testId={key}
          text={text}
        />
      ))}

      <AlertDialog onOpenChange={(open) => !open && setNotice(null)} open={notice !== null}>
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            // Put the cursor on the field the popup complained about, not back on the button.
            event.preventDefault()
            if (notice) document.getElementById(notice.focusId)?.focus()
          }}
          size="sm"
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Проверьте форму</AlertDialogTitle>
            <AlertDialogDescription data-testid="signup-notice">{notice?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>ОК</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
