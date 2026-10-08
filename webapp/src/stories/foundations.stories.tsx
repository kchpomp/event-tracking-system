import type { Meta, StoryObj } from '@storybook/react-vite'

import { Typography } from '@/components/typography'

const meta = {
  title: 'Foundations/Tokens',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const colors = [
  ['Background', 'bg-background', 'text-foreground'],
  ['Card', 'bg-card', 'text-card-foreground'],
  ['Primary', 'bg-primary', 'text-primary-foreground'],
  ['Secondary', 'bg-secondary', 'text-secondary-foreground'],
  ['Muted', 'bg-muted', 'text-muted-foreground'],
  ['Destructive', 'bg-destructive', 'text-white'],
  ['Brand', 'bg-brand', 'text-brand-foreground'],
  ['Highlight', 'bg-highlight', 'text-highlight-foreground'],
] as const

// Neutrals are Dark Teal tints; in the light theme these are 100 / 70 / 50 / 30 / 15 / 6 %.
const tints = [
  ['Foreground', 'bg-foreground'],
  ['Muted foreground', 'bg-muted-foreground'],
  ['Input', 'bg-input'],
  ['Chart 5', 'bg-chart-5'],
  ['Border', 'bg-border'],
  ['Muted', 'bg-muted'],
] as const

export const Colors: Story = {
  render: () => (
    <div className="mx-auto grid max-w-5xl gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
      {colors.map(([label, background]) => (
        <div className="rounded-xl border bg-card p-2 text-card-foreground" key={label}>
          <div aria-hidden="true" className={`${background} h-24 rounded-lg border`} />
          <div className="grid gap-1 p-3">
            <Typography variant="bodySmMedium">{label}</Typography>
            <Typography tone="muted" variant="caption">{background}</Typography>
          </div>
        </div>
      ))}
    </div>
  ),
}

export const DarkTealTints: Story = {
  render: () => (
    <div className="mx-auto grid max-w-5xl gap-4 p-6 sm:grid-cols-3 lg:grid-cols-6">
      {tints.map(([label, background]) => (
        <div className="grid gap-2" key={label}>
          <div aria-hidden="true" className={`${background} h-16 rounded-md border`} />
          <Typography variant="caption">{label}</Typography>
          <Typography tone="muted" variant="caption">{background}</Typography>
        </div>
      ))}
    </div>
  ),
}

export const TypographyScale: Story = {
  render: () => (
    <div className="mx-auto grid max-w-3xl gap-5 p-6">
      {(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'lead', 'body', 'bodySm', 'caption', 'code'] as const).map((variant) => (
        <div className="grid gap-1 border-b pb-4" key={variant}>
          <Typography variant="caption" tone="muted">{variant}</Typography>
          <Typography variant={variant}>The quick brown fox builds a consistent interface.</Typography>
        </div>
      ))}
    </div>
  ),
}
