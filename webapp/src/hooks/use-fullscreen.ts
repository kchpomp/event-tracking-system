import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void) {
  document.addEventListener('fullscreenchange', onChange)
  return () => document.removeEventListener('fullscreenchange', onChange)
}

/**
 * The browser's full-screen state for the whole page, following Esc and the browser's own exit.
 * `supported` is false where the API is missing (for instance iPhone Safari), and the toggle then
 * does nothing.
 */
export function useFullscreen() {
  const active = useSyncExternalStore(subscribe, () => document.fullscreenElement !== null, () => false)
  const supported = typeof document !== 'undefined' && document.fullscreenEnabled === true
  const toggle = () => {
    const change = document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen()
    void change.catch(() => undefined)
  }
  return { active, supported, toggle }
}
