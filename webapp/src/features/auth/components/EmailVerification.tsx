import type { UserDto } from '@event-tracking-system/contracts'
import { Link } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'

import { Typography } from '@/components/typography'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { authErrorMessage } from '../auth-errors'
import {
  isEmailVerificationToken,
  useConfirmEmailVerificationMutation,
  useRequestEmailVerificationMutation,
} from '../email-verification'

/** Shown in the profile until the address is verified; nothing once it is. */
export function EmailVerificationCard({ user }: { user: Pick<UserDto, 'email' | 'emailVerified'> }) {
  const request = useRequestEmailVerificationMutation()
  if (user.emailVerified) return null

  return (
    <Card data-testid="email-verification-card">
      <CardHeader>
        <CardTitle>Почта не подтверждена</CardTitle>
        <CardDescription>
          Подтвердите адрес, чтобы организаторы могли назначить вам роль хостес или администратора.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {request.isSuccess && (
          <Alert data-testid="email-verification-sent">
            <AlertTitle>Письмо отправлено</AlertTitle>
            <AlertDescription>
              Откройте ссылку из письма на {user.email}. Она действует 24 часа.
            </AlertDescription>
          </Alert>
        )}
        {request.isError && (
          <Alert variant="destructive">
            <AlertTitle>Письмо не отправлено</AlertTitle>
            <AlertDescription>{authErrorMessage(request.error, 'verify-request')}</AlertDescription>
          </Alert>
        )}
        <div>
          <Button
            data-testid="email-verification-request"
            disabled={request.isPending}
            onClick={() => request.mutate()}
            type="button"
          >
            {request.isPending
              ? 'Отправляем…'
              : request.isSuccess
                ? 'Отправить ещё раз'
                : 'Подтвердить почту'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/** The page behind the emailed link: confirms the token as soon as it opens. */
export function VerifyEmail({ token }: { token: string }) {
  const confirm = useConfirmEmailVerificationMutation()
  const tokenIsValid = isEmailVerificationToken(token)
  const sent = useRef(false)

  useEffect(() => {
    if (!tokenIsValid || sent.current) return
    sent.current = true
    confirm.mutate({ token })
  }, [confirm, token, tokenIsValid])

  return (
    <div className="flex flex-col gap-6" data-testid="verify-email">
      <Typography as="h1" variant="h3" balance>
        Подтверждение почты
      </Typography>

      {!tokenIsValid ? (
        <Alert variant="destructive">
          <AlertTitle>Ссылка неполная</AlertTitle>
          <AlertDescription>
            Откройте ссылку из письма целиком или запросите новую в профиле.
          </AlertDescription>
        </Alert>
      ) : confirm.isSuccess ? (
        <Alert data-testid="verify-email-success">
          <AlertTitle>Почта подтверждена</AlertTitle>
          <AlertDescription>Теперь организаторы могут назначить вам роль.</AlertDescription>
        </Alert>
      ) : confirm.isError ? (
        <div className="flex flex-col items-start gap-3">
          <Alert data-testid="verify-email-error" variant="destructive">
            <AlertTitle>Не удалось подтвердить почту</AlertTitle>
            <AlertDescription>{authErrorMessage(confirm.error, 'verify-confirm')}</AlertDescription>
          </Alert>
          <Button onClick={() => confirm.mutate({ token })} type="button" variant="outline">
            Повторить
          </Button>
        </div>
      ) : (
        <Typography role="status" tone="muted" variant="bodySm">
          Подтверждаем почту…
        </Typography>
      )}

      <Typography variant="bodySm">
        <Link className="underline underline-offset-4" search={{ returnTo: undefined }} to="/">
          Перейти в приложение
        </Link>
      </Typography>
    </div>
  )
}
