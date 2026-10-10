import { useState } from 'react'

import { Typography } from '@/components/typography'
import { Button } from '@/components/ui/button'
import { COOKIE_NOTICE_TEXT, PRIVACY_POLICY_URL } from '@/features/auth'

// Only technical cookies and browser storage are used (session, sidebar state, session sync), none
// of which needs consent, so this is a notice, not an opt-in. The "seen" mark lives in
// localStorage; if storage is blocked the notice simply shows on every visit.
const COOKIE_NOTICE_KEY = 'event_tracking_system_cookie_notice'

function wasSeen() {
  try {
    return localStorage.getItem(COOKIE_NOTICE_KEY) === '1'
  } catch {
    return false
  }
}

export function CookieNotice() {
  const [visible, setVisible] = useState(() => !wasSeen())

  function dismiss() {
    try {
      localStorage.setItem(COOKIE_NOTICE_KEY, '1')
    } catch {
      // Blocked storage: hide it for this visit only.
    }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      aria-label="Уведомление о cookie"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-popover px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-popover-foreground"
      data-testid="cookie-notice"
      role="region"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Typography variant="bodySm">{COOKIE_NOTICE_TEXT}</Typography>
        <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row">
          <Button asChild size="lg" variant="outline">
            <a
              data-testid="cookie-notice-policy"
              href={PRIVACY_POLICY_URL}
              rel="noreferrer"
              target="_blank"
            >
              <Typography as="span" variant="control">
                Политика СИБУР
              </Typography>
            </a>
          </Button>
          <Button data-testid="cookie-notice-ok" onClick={dismiss} size="lg" type="button">
            Понятно
          </Button>
        </div>
      </div>
    </div>
  )
}
