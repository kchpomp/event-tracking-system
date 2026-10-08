import { Link } from '@tanstack/react-router'

import { Typography } from '@/components/typography'
import { Button } from '@/components/ui/button'

/** Shown instead of the sign-up form while an administrator keeps registration closed. */
export function RegistrationClosed() {
  return (
    <div className="flex flex-col items-center gap-4 text-center" data-testid="registration-closed">
      <Typography as="h1" balance variant="h3">
        Регистрация закрыта
      </Typography>
      <Typography balance tone="muted" variant="bodySm">
        Новые участники сейчас не принимаются. Если вы уже зарегистрированы, войдите в свой аккаунт.
      </Typography>
      <Button asChild className="h-11" size="lg">
        <Link search={{ returnTo: undefined }} to="/login">
          Войти
        </Link>
      </Button>
    </div>
  )
}
