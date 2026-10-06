import { useTheme } from 'next-themes'

import {
  Moon02Icon,
  Sun01Icon,
  ComputerIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldLabel,
} from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Typography } from '@/components/typography'

const themes = ['system', 'light', 'dark'] as const
type Theme = typeof themes[number]

const themeOptions = {
  system: { icon: ComputerIcon, label: 'Как в системе' },
  light: { icon: Sun01Icon, label: 'Светлая' },
  dark: { icon: Moon02Icon, label: 'Тёмная' },
} as const

export function AppearancePanel() {
  const { theme = 'system', setTheme } = useTheme()
  const selectedTheme = isTheme(theme) ? theme : 'system'

  return (
    <Card>
      <CardHeader>
        <Typography as="h2" variant="h6">
          Оформление
        </Typography>
        <CardDescription>
          Следовать настройке устройства или всегда держать светлую или тёмную тему.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Field>
          <FieldLabel htmlFor="appearance-theme">Тема</FieldLabel>
          <Select
            onValueChange={(value) => {
              if (isTheme(value)) setTheme(value)
            }}
            value={selectedTheme}
          >
            <SelectTrigger className="w-full sm:w-52" id="appearance-theme">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {themes.map((item) => (
                <SelectItem key={item} value={item}>
                  <HugeiconsIcon aria-hidden icon={themeOptions[item].icon} strokeWidth={2} />
                  {themeOptions[item].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            Выбор сохраняется в этом браузере и применяется сразу.
          </FieldDescription>
        </Field>
      </CardContent>
    </Card>
  )
}

function isTheme(value: string): value is Theme {
  return themes.some((theme) => theme === value)
}
