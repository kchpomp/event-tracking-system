import { Link } from '@tanstack/react-router'
import {
  registerRequestSchema,
  type ReferenceOption,
  type RegisterRequest,
} from '@event-tracking-system/contracts'
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
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { ApiRequestError } from '@/platform/api'
import { authErrorMessage } from '../auth-errors'
import { CONSENT_TEXT } from '../consent-text'
import { PRIVACY_POLICY_URL } from '../legal-links'
import { useAuth } from '../use-auth'
import { ConsentDialog } from './ConsentDialog'
import { FormAlert } from './form-errors'
import type { FieldErrors } from './form-model'
import { clearFieldError, errorId, hasErrors, toValidationErrors } from './form-validation'
import { PasswordInput } from './PasswordInput'

// These two sentences are the product's own wording: do not reword them.
const MSG_REQUIRED = 'Не все обязательные поля заполнены'
const MSG_CONSENT = 'Не получено соглашение на обработку персональных данных'

const TEXT_FIELDS = [
  { key: 'email', label: 'Email', autoComplete: 'email', max: 254, placeholder: 'вы@email.com' },
  { key: 'firstName', label: 'Имя', autoComplete: 'given-name', max: 100 },
  { key: 'lastName', label: 'Фамилия', autoComplete: 'family-name', max: 100 },
] as const

// Chosen from the reference lists: the value of these two is the chosen entry's id.
const LIST_FIELDS = [
  { key: 'company', label: 'Предприятие / подразделение', autoComplete: 'organization' },
  { key: 'city', label: 'Город', autoComplete: 'address-level2' },
] as const

type FieldKey = (typeof TEXT_FIELDS)[number]['key'] | (typeof LIST_FIELDS)[number]['key']
type Values = Record<FieldKey | 'password', string>
const EMPTY: Values = { email: '', firstName: '', lastName: '', company: '', city: '', password: '' }

type Notice = { message: string; focusId: string }

type RegisterFormProps = {
  cities: readonly ReferenceOption[]
  companies: readonly ReferenceOption[]
  returnTo?: string
}

export function RegisterForm({ cities, companies, returnTo }: RegisterFormProps) {
  const auth = useAuth()
  const baseId = useId()
  const idOf = (key: string) => `${baseId}-${key}`
  const [values, setValues] = useState<Values>(EMPTY)
  const [hostess, setHostess] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [consentOpen, setConsentOpen] = useState(false)
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
    const empty = [
      ...TEXT_FIELDS.map((field) => field.key),
      ...(hostess ? [] : LIST_FIELDS.map((field) => field.key)),
      'password' as const,
    ].filter((key) => values[key].trim() === '')
    if (empty.length > 0) {
      setMissing(new Set(empty))
      setNotice({ message: MSG_REQUIRED, focusId: idOf(empty[0]!) })
      return
    }
    if (!agreed) {
      setNotice({ message: MSG_CONSENT, focusId: idOf('consent') })
      return
    }

    const { company, city, ...rest } = values
    // A hostess gives no company or city; the server accepts that only for a listed address.
    const result = registerRequestSchema.safeParse({
      ...rest,
      ...(hostess ? {} : { companyId: company, cityId: city }),
      consent: true,
    })
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
      setFormError(
        hostess && caught instanceof ApiRequestError && caught.status === 400
          ? 'Этого адреса нет в списке хостесс. Проверьте почту или зарегистрируйтесь как участник.'
          : authErrorMessage(caught, 'register'),
      )
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
          <div className="flex flex-col gap-1">
            <Typography as="h1" balance variant="h3">
              Регистрация
            </Typography>
            <Typography balance tone="muted" variant="bodySm">
              Создайте аккаунт участника
            </Typography>
          </div>

          <div aria-label="Кто вы" className="grid grid-cols-2 gap-2" role="group">
            {[
              { value: false, label: 'Участник', testId: 'signup-as-participant' },
              { value: true, label: 'Хостес', testId: 'signup-as-hostess' },
            ].map((option) => (
              <Button
                aria-pressed={hostess === option.value}
                data-testid={option.testId}
                key={option.testId}
                onClick={() => {
                  setHostess(option.value)
                  setFormError(null)
                  setMissing(new Set())
                }}
                type="button"
                variant={hostess === option.value ? 'default' : 'outline'}
              >
                {option.label}
              </Button>
            ))}
          </div>
          {hostess && (
            <Typography tone="muted" variant="bodySm">
              Хостесс предприятие и город не указывают. Почта должна быть в списке организаторов, а
              роль хостес вам назначит администратор после регистрации.
            </Typography>
          )}

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

          {!hostess && LIST_FIELDS.map((field) => {
            const options = field.key === 'company' ? companies : cities
            const invalid = missing.has(field.key)
            return (
              <Field data-invalid={invalid} key={field.key}>
                <FieldLabel htmlFor={idOf(field.key)}>{field.label} *</FieldLabel>
                <NativeSelect
                  aria-invalid={invalid}
                  autoComplete={field.autoComplete}
                  className="w-full"
                  data-testid={`signup-${field.key}`}
                  id={idOf(field.key)}
                  onChange={(event) => change(field.key, event.target.value)}
                  value={values[field.key]}
                >
                  <NativeSelectOption value="">Выберите из списка</NativeSelectOption>
                  {options.map((option) => (
                    <NativeSelectOption key={option.id} value={option.id}>
                      {option.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
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

          {/* The consent is its own document and its own tick (152-ФЗ, ст. 9). The policy is only linked. */}
          <div className="flex items-center gap-3">
            <Checkbox
              aria-label="Я даю согласие на обработку персональных данных"
              checked={agreed}
              data-testid="signup-consent"
              id={idOf('consent')}
              onCheckedChange={(checked) => setAgreed(checked === true)}
            />
            <Button
              className="h-auto min-h-11 min-w-0 shrink justify-start px-0 text-left whitespace-normal"
              data-testid="consent-link"
              onClick={() => setConsentOpen(true)}
              type="button"
              variant="link"
            >
              Я даю согласие на обработку персональных данных
            </Button>
          </div>

          <Typography tone="muted" variant="bodyXs">
            Как СИБУР обрабатывает персональные данные, описано в{' '}
            <a
              className="underline underline-offset-4"
              data-testid="privacy-policy-link"
              href={PRIVACY_POLICY_URL}
              rel="noreferrer"
              target="_blank"
            >
              <Typography as="span" variant="bodyXs">
                Политике в отношении обработки персональных данных (PDF)
              </Typography>
            </a>
            .
          </Typography>

          <FormAlert message={formError} title="Не удалось зарегистрироваться" />

          <Field>
            <Button className="h-11" data-testid="signup-submit" disabled={pending} size="lg" type="submit">
              {pending ? 'Регистрация…' : 'Присоединиться'}
            </Button>
          </Field>

          <FieldDescription>
            Уже есть аккаунт?{' '}
            <Link search={{ returnTo }} to="/login">
              Войти
            </Link>
          </FieldDescription>
        </FieldGroup>
      </form>

      <ConsentDialog
        onAgree={() => {
          setAgreed(true)
          setConsentOpen(false)
        }}
        onOpenChange={setConsentOpen}
        open={consentOpen}
        testId="consent"
        text={CONSENT_TEXT}
      />

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
