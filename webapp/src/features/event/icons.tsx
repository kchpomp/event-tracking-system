import { pictogramFor } from './pictograms'
import { Pictogram } from './station-icons'

// The pictograms live in station-icons.tsx; these names are what the pages import.
export function StationIcon({ name }: { name: string }) {
  return <Pictogram className="size-5" name={pictogramFor(name)} />
}

export function ActivityIcon({ kind }: { kind: 'diffusion' | 'ideas' }) {
  return <Pictogram className="size-5" name={kind} />
}

/** The mark of «Полимер решений» (its card and its page). */
export function PolymerChain() {
  return <Pictogram className="size-5" name="polymer" />
}
