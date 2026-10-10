import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { Typography } from '@/components/typography'
import { PRIVACY_POLICY_URL } from '../legal-links'

/**
 * Design B «Глубина»: Dark Teal page, text on the left edge, and a band of three pattern cells
 * across the bottom (on wide screens the tall cover takes that role instead).
 */
export function AuthPageShell({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-svh lg:grid-cols-2">
      <section className="flex flex-col gap-4 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <div className="flex flex-col gap-1 px-6 md:px-10 md:pt-4">
          <Link search={{ returnTo: undefined }} to="/login">
            <Typography as="span" variant="h4" weight="normal" wrap="nowrap">
              Формула{' '}
              <Typography as="span" variant="h4">
                Будущего
              </Typography>
            </Typography>
          </Link>
          <Typography tone="muted" variant="bodySm">
            Сила — в соединении.
          </Typography>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 py-4 md:px-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <Typography className="px-6 md:px-10" tone="muted" variant="bodyXs">
          <a
            className="underline underline-offset-4"
            href={PRIVACY_POLICY_URL}
            rel="noreferrer"
            target="_blank"
          >
            <Typography as="span" variant="bodyXs">
              Политика СИБУР в отношении обработки персональных данных
            </Typography>
          </a>
        </Typography>
        <svg
          aria-hidden
          className="mt-2 block h-16 w-full lg:hidden"
          preserveAspectRatio="xMidYMid slice"
          viewBox="0 0 300 64"
        >
          <rect fill="#008C95" height="64" width="100" x="0" y="0" />
          <circle cx="50" cy="32" fill="#77E2C3" r="22" />
          <rect fill="#0D3B46" height="64" width="100" x="100" y="0" />
          <path d="M100 64V20A44 44 0 0 1 144 64Z" fill="#77E2C3" />
          <rect fill="#77E2C3" height="64" width="100" x="200" y="0" />
          <rect fill="#00313C" height="24" width="24" x="238" y="20" />
        </svg>
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
