import { useId } from 'react'

/**
 * Station and activity pictograms: simple filled figures on a 64 x 64 grid, in the idiom of the
 * partnership pattern (circle, ring, square, triangle, diamond; brand book pp. 32-33 and 68).
 * They are a proposal, not an approved SIBUR set: the brand book has no per-activity marks.
 *
 * `solid` is flat; `dots` is the traditional dotted version of p. 68 and only reads from 34 px up,
 * so it is for large placements. Colour is `currentColor`.
 */
const DRAWINGS = {
  connection: (
    <>
      <circle cx="21" cy="32" r="11" />
      <circle cx="43" cy="32" fill="none" r="8" stroke="currentColor" strokeWidth="6" />
    </>
  ),
  people: (
    <>
      <circle cx="32" cy="21" r="9" />
      <path d="M12 54a20 20 0 0 1 40 0z" />
    </>
  ),
  workshop1: (
    <>
      <path d="M32 8 52 28H12z" />
      <path d="M32 34 52 54H12z" />
    </>
  ),
  workshop2: (
    <>
      <rect height="24" width="24" x="8" y="20" />
      <circle cx="44" cy="32" r="12" />
    </>
  ),
  workshop3: (
    <path
      d="M32 6 58 32 32 58 6 32z M32 24a8 8 0 1 0 0 16a8 8 0 1 0 0-16z"
      fillRule="evenodd"
    />
  ),
  diffusion: (
    <>
      <circle cx="20" cy="32" r="11" />
      <circle cx="38" cy="32" r="7" />
      <circle cx="49" cy="32" r="4" />
      <circle cx="55" cy="32" r="2" />
    </>
  ),
  ideas: (
    <path
      d="M25 6h14v16.5a20 20 0 1 1-14 0z M32 38a5 5 0 1 0 0 10a5 5 0 1 0 0-10z"
      fillRule="evenodd"
    />
  ),
  polymer: (
    <>
      <path d="M12 42 24 24 40 38 54 18" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
      <circle cx="12" cy="42" r="6" />
      <circle cx="24" cy="24" r="7" />
      <circle cx="40" cy="38" r="8" />
      <circle cx="54" cy="18" r="6" />
    </>
  ),
  station: (
    <path d="M10 10h44v44H10z M32 24a8 8 0 1 0 0 16a8 8 0 1 0 0-16z" fillRule="evenodd" />
  ),
} as const

export type PictogramName = keyof typeof DRAWINGS

type PictogramProps = {
  className?: string
  name: PictogramName
  /** Rendered size in pixels; the dotted version is only drawn from 34 px up. */
  size?: number
  tone?: 'solid' | 'dots'
}

export function Pictogram({ className = 'size-5', name, size = 20, tone = 'solid' }: PictogramProps) {
  const id = useId()
  const drawing = DRAWINGS[name]
  // The dotted version turns to mush below 34 px: small placements are always solid.
  if (tone === 'solid' || size < 34) {
    return (
      <svg aria-hidden className={className} fill="currentColor" viewBox="0 0 64 64">
        {drawing}
      </svg>
    )
  }
  return (
    <svg aria-hidden className={className} fill="none" viewBox="0 0 64 64">
      <defs>
        <mask id={`m${id}`}>
          <g fill="#fff" stroke="#fff">
            {drawing}
          </g>
        </mask>
        <pattern
          height="4.6"
          id={`p${id}`}
          patternTransform="rotate(45)"
          patternUnits="userSpaceOnUse"
          width="4.6"
        >
          <circle cx="2.3" cy="2.3" fill="currentColor" r="1.5" />
        </pattern>
      </defs>
      <rect fill={`url(#p${id})`} height="64" mask={`url(#m${id})`} width="64" />
    </svg>
  )
}
