import { Link } from '@tanstack/react-router'

import { Typography } from '@/components/typography'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useFullscreen } from '@/hooks/use-fullscreen'

const choices = [
  { to: '/screen/network', title: 'Сеть знакомств', description: 'Участники и их связи в «Диффузии»' },
  { to: '/screen/flask', title: 'Колба идей', description: 'Колба для вертикального экрана с QR-кодом' },
] as const

/** The start page of the display account: choose what the screen shows. */
export function ScreenMenu({ onLogout }: { onLogout: () => Promise<void> }) {
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-3xl content-center gap-8 p-6" data-testid="screen-menu">
      <Typography align="center" variant="h1">
        Что показываем на экране?
      </Typography>
      <div className="grid gap-4 sm:grid-cols-2">
        {choices.map((choice) => (
          <Link data-testid={`screen-choice-${choice.to.split('/').pop()}`} key={choice.to} to={choice.to}>
            <Card className="h-full transition-colors hover:bg-accent">
              <CardHeader>
                <CardTitle>{choice.title}</CardTitle>
                <CardDescription>{choice.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
      <div className="flex justify-center">
        <Button data-testid="logout" onClick={() => void onLogout().catch(() => undefined)} size="sm" type="button" variant="ghost">
          Выйти
        </Button>
      </div>
    </main>
  )
}

/**
 * Controls over a running visualization. In full screen they are gone altogether, so the display
 * in the hall shows nothing but the visualization; Esc leaves full screen.
 */
export function ScreenControls({
  back,
  onLogout,
}: {
  back: { to: '/screen' | '/admin'; label: string }
  onLogout: (() => Promise<void>) | null
}) {
  const { active, supported, toggle } = useFullscreen()
  if (active) return null
  return (
    <div className="fixed top-2 right-2 z-50 flex items-center gap-1">
      <Button asChild size="sm" variant="ghost">
        <Link data-testid="screen-back" to={back.to}>
          {back.label}
        </Link>
      </Button>
      {supported && (
        <Button data-testid="screen-fullscreen" onClick={toggle} size="sm" type="button" variant="ghost">
          Полный экран
        </Button>
      )}
      {onLogout && (
        <Button data-testid="logout" onClick={() => void onLogout().catch(() => undefined)} size="sm" type="button" variant="ghost">
          Выйти
        </Button>
      )}
    </div>
  )
}
