import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { Typography } from '@/components/typography'
import { Button } from '@/components/ui/button'

// Only technical cookies and browser storage are used (session, sidebar state, session sync), none
// of which needs consent, so this is a notice with one button, not an opt-in. The "seen" mark lives
// in localStorage; if storage is blocked the notice simply shows on every visit.
export const COOKIE_NOTICE_KEY = 'event_tracking_system_cookie_notice'

function wasSeen() {
  try {
    return localStorage.getItem(COOKIE_NOTICE_KEY) === '1'
  } catch {
    return false
  }
}

export function CookieNotice() {
  const [visible, setVisible] = useState(() => !wasSeen())
  if (!visible) return null

  function dismiss() {
    try {
      localStorage.setItem(COOKIE_NOTICE_KEY, '1')
    } catch {
      // Blocked storage: hide it for this visit only.
    }
    setVisible(false)
  }

  return (
    <div
      aria-label="Уведомление о cookie"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background p-4 shadow-lg"
      data-testid="cookie-notice"
      role="region"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Typography variant="bodySm">
          Сайт использует только технические cookie: они нужны, чтобы вы оставались в аккаунте. Рекламы и
          аналитики нет.{' '}
          <Link className="underline underline-offset-4" to="/privacy">
            Политика конфиденциальности
          </Link>
        </Typography>
        <Button className="h-11 sm:shrink-0" data-testid="cookie-notice-ok" onClick={dismiss} type="button">
          Понятно
        </Button>
      </div>
    </div>
  )
}
