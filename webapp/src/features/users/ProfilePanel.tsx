import type { UserDto } from '@event-tracking-system/contracts'
import { useId, useState, type FormEvent } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Typography } from '@/components/typography'
import { errorId, hasErrors } from '@/features/auth'
import { validateProfileForm } from './profile-form'
import { useUpdateProfileMutation } from './queries'

export function ProfilePanel({ user }: { user: UserDto }) {
  const displayNameErrorId = useId()
  const [displayName, setDisplayName] = useState(user.displayName ?? '')
  const mutation = useUpdateProfileMutation()
  const validation = validateProfileForm(displayName)
  const displayNameErrors = validation.errors?.fieldErrors.displayName
  const displayNameInvalid = hasErrors(displayNameErrors)

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!validation.request) return
    mutation.mutate(validation.request.displayName, {
      onSuccess: (response) => setDisplayName(response.user.displayName ?? ''),
    })
  }

  return (
    <Card>
      <CardHeader>
        <Typography as="h2" variant="h6">
          Профиль
        </Typography>
        <CardDescription>
          Имя, которое показывается в кабинете. Email меняется отдельно.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-5" noValidate onSubmit={submit}>
          <FieldGroup>
            <Field data-invalid={displayNameInvalid}>
              <FieldLabel htmlFor="profile-display-name">Отображаемое имя</FieldLabel>
              <Input
                aria-describedby={errorId(displayNameErrors, displayNameErrorId)}
                aria-invalid={displayNameInvalid}
                autoComplete="name"
                data-testid="profile-display-name"
                disabled={mutation.isPending}
                id="profile-display-name"
                onChange={(event) => {
                  setDisplayName(event.target.value)
                  mutation.reset()
                }}
                placeholder="Ваше имя"
                value={displayName}
              />
              <FieldDescription>Оставьте пустым, чтобы показывался email.</FieldDescription>
              <FieldError id={displayNameErrorId} errors={displayNameErrors} />
            </Field>
            <Field>
              <FieldLabel htmlFor="profile-email">Email</FieldLabel>
              <Input
                aria-readonly="true"
                id="profile-email"
                readOnly
                value={user.email}
              />
              <FieldDescription>Смена email пока недоступна.</FieldDescription>
            </Field>
          </FieldGroup>

          {validation.errors?.formError && (
            <Alert variant="destructive">
              <AlertTitle>Профиль нельзя сохранить</AlertTitle>
              <AlertDescription>{validation.errors.formError}</AlertDescription>
            </Alert>
          )}
          {mutation.isError && (
            <Alert variant="destructive">
              <AlertTitle>Профиль не сохранён</AlertTitle>
              <AlertDescription>{mutation.error.message}</AlertDescription>
            </Alert>
          )}
          {mutation.isSuccess && (
            <Alert>
              <AlertTitle>Профиль сохранён</AlertTitle>
              <AlertDescription>Отображаемое имя обновлено.</AlertDescription>
            </Alert>
          )}

          <div>
            <Button
              data-testid="profile-save"
              disabled={mutation.isPending || validation.errors !== null}
              type="submit"
            >
              {mutation.isPending ? 'Сохраняем…' : 'Сохранить'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
