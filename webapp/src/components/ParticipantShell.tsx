import { Link } from '@tanstack/react-router'
import { useState, type PropsWithChildren } from 'react'

import { Typography } from '@/components/typography'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Brand } from '@/features/event'

/**
 * The phone frame: one narrow column, a sticky header with the brand, the profile and sign-out.
 * Participants and hostesses have no sidebar (hostesses have no profile page either: `showProfile`
 * is off for them); administrators keep `WorkspaceShell`.
 */
export function ParticipantShell({
  children,
  home = '/app',
  onLogout,
  showProfile = true,
}: PropsWithChildren<{
  home?: '/app' | '/hostess'
  onLogout: () => Promise<void>
  showProfile?: boolean
}>) {
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  async function logout() {
    setPending(true)
    setFailed(false)
    try {
      await onLogout()
    } catch {
      // The session is still active: say so instead of showing a sign-out that did not happen.
      setFailed(true)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-background pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-3 px-4 py-3">
          <Link to={home}>
            <Brand />
          </Link>
          <div className="flex items-center gap-2">
            {showProfile && (
              <Button asChild size="lg" variant="outline">
                <Link data-testid="nav-profile" to="/app/profile">
                  Профиль
                </Link>
              </Button>
            )}
            <Button
              data-testid="logout"
              disabled={pending}
              onClick={() => void logout()}
              size="lg"
              type="button"
              variant="outline"
            >
              {pending ? 'Выходим…' : 'Выйти'}
            </Button>
          </div>
        </div>
        {failed && (
          <div className="mx-auto w-full max-w-lg px-4 pb-3">
            <Alert data-testid="logout-error" variant="destructive">
              <AlertDescription>
                <Typography as="span" variant="bodySm">
                  Не удалось выйти. Вы всё ещё в аккаунте, попробуйте ещё раз.
                </Typography>
              </AlertDescription>
            </Alert>
          </div>
        )}
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {children}
      </main>
    </div>
  )
}
