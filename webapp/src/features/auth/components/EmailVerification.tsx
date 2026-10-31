import { Link } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'

import { Typography } from '@/components/typography'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { authErrorMessage } from '../auth-errors'
import { isEmailVerificationToken, useConfirmEmailVerificationMutation } from '../email-verification'

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
