import {
  Compass01Icon,
  FlaskConicalIcon,
  PinLocation01Icon,
  PuzzleIcon,
  Share08Icon,
  UserMultipleIcon,
  Video01Icon,
  Wrench01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'

// Station icons are matched by station name; a station the organizers add later falls back to the pin.
const STATION_ICON: Record<string, IconSvgElement> = {
  'Точка соединения': Share08Icon,
  'Люди формулы будущего': Video01Icon,
  'Воркшоп 1': Wrench01Icon,
  'Воркшоп 2': PuzzleIcon,
  'Воркшоп 3': Compass01Icon,
}

const ACTIVITY_ICON = { diffusion: UserMultipleIcon, ideas: FlaskConicalIcon } as const

export function StationIcon({ name }: { name: string }) {
  return <HugeiconsIcon aria-hidden icon={STATION_ICON[name] ?? PinLocation01Icon} strokeWidth={2} />
}

export function ActivityIcon({ kind }: { kind: keyof typeof ACTIVITY_ICON }) {
  return <HugeiconsIcon aria-hidden icon={ACTIVITY_ICON[kind]} strokeWidth={2} />
}

/** Connected dots in miniature: the mark of «Полимер решений» (its card and its page). */
export function PolymerChain() {
  return (
    <svg aria-hidden className="h-6 w-[2.4rem]" viewBox="0 0 72 24">
      <path d="M6 17L22 7L40 16L58 6L67 12" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <g fill="currentColor">
        <circle cx="6" cy="17" r="3" />
        <circle cx="22" cy="7" r="4" />
        <circle cx="40" cy="16" r="3.5" />
        <circle cx="58" cy="6" r="4" />
        <circle cx="67" cy="12" r="2.5" />
      </g>
    </svg>
  )
}

/** The molecule / polymer-chain picture of the brand: points that join into a structure. */
export function HeroNet() {
  return (
    <svg
      aria-hidden
      className="h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 400 300"
    >
      <path
        d="M30 70L110 120L200 55L290 125L370 75M110 120L150 215L255 195L290 125M150 215L55 260M255 195L345 250M200 55L235 15"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <g fill="currentColor">
        <circle cx="30" cy="70" r="4" />
        <circle cx="110" cy="120" r="6" />
        <circle cx="200" cy="55" r="5" />
        <circle cx="290" cy="125" r="7" />
        <circle cx="370" cy="75" r="4" />
        <circle cx="150" cy="215" r="5" />
        <circle cx="255" cy="195" r="6" />
        <circle cx="55" cy="260" r="4" />
        <circle cx="345" cy="250" r="5" />
        <circle cx="235" cy="15" r="3" />
      </g>
    </svg>
  )
}
