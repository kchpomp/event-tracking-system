import { CookieIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'

import { Typography } from '@/components/typography'
import { Button } from '@/components/ui/button'
import { ConsentDialog, COOKIE_NOTICE_TEXT, PRIVACY_TEXT } from '@/features/auth'

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
  const [policyOpen, setPolicyOpen] = useState(false)

  function dismiss() {
    try {
      localStorage.setItem(COOKIE_NOTICE_KEY, '1')
    } catch {
      // Blocked storage: hide it for this visit only.
    }
    setVisible(false)
  }

  return (
    <>
      {visible && (
        <div
          aria-label="Уведомление о cookie"
          className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
          data-testid="cookie-notice"
          role="region"
        >
          <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 rounded-xl bg-popover p-5 text-center text-popover-foreground shadow-lg ring-1 ring-foreground/10">
            <HugeiconsIcon className="size-8 text-primary" icon={CookieIcon} strokeWidth={2} />
            <Typography balance variant="bodySm">
              {COOKIE_NOTICE_TEXT}
            </Typography>
            <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-center sm:*:min-w-40">
              <Button
                data-testid="cookie-notice-policy"
                onClick={() => setPolicyOpen(true)}
                size="lg"
                type="button"
                variant="outline"
              >
                Политика конфиденциальности
              </Button>
              <Button data-testid="cookie-notice-ok" onClick={dismiss} size="lg" type="button">
                Понятно
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConsentDialog
        onAgree={() => {
          setPolicyOpen(false)
          dismiss()
        }}
        onOpenChange={setPolicyOpen}
        open={policyOpen}
        testId="cookie-policy"
        text={PRIVACY_TEXT}
      />
    </>
  )
}
