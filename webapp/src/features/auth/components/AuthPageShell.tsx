import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { Typography } from '@/components/typography'

export function AuthPageShell({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-svh lg:grid-cols-2">
      <section className="flex flex-col gap-4 p-6 pt-[max(1.5rem,env(safe-area-inset-top))] md:p-10">
        <div className="flex flex-col items-center gap-1 md:items-start">
          <Link search={{ returnTo: undefined }} to="/login">
            <Typography as="span" variant="h4" weight="normal" wrap="nowrap">
              Формула{' '}
              <Typography as="span" tone="highlight" variant="h4">
                Будущего
              </Typography>
            </Typography>
          </Link>
          <Typography tone="muted" variant="bodySm">
            Сила — в соединении.
          </Typography>
        </div>
        <div className="flex flex-1 items-center justify-center py-4">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <Typography className="text-center" tone="muted" variant="bodyXs">
          <Link className="underline underline-offset-4" to="/privacy">
            Политика конфиденциальности
          </Link>
        </Typography>
      </section>
      <section aria-hidden className="relative hidden overflow-hidden bg-muted lg:block">
        <img
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          src="/auth-cover.svg"
        />
      </section>
    </main>
  )
}
