/**
 * The part of the page the person can actually see.
 *
 * iOS 26 Safari moves `position: fixed` boxes by its own rules while the address bar and the tab
 * bar change (a dialog centred with `top: 50%` can land at the top of the screen). The visual
 * viewport knows where the visible area is, so the page publishes its middle and its height as
 * CSS variables and dialogs centre on them (see `index.css`). Where `visualViewport` is missing
 * the variables stay unset, and the CSS falls back to the usual `50%`.
 */

export type VisibleArea = { centerY: number; height: number }

/** The vertical middle and the height of the visible area, in CSS px of the layout viewport. */
export function visibleArea(viewport: { height: number; offsetTop: number }): VisibleArea {
  return { centerY: Math.round(viewport.offsetTop + viewport.height / 2), height: Math.round(viewport.height) }
}

/** Keeps `--viewport-center` and `--viewport-height` current; returns the cleanup. */
export function trackVisibleArea(root: HTMLElement = document.documentElement) {
  const viewport = window.visualViewport
  if (!viewport) return () => {}

  let frame = 0
  const publish = () => {
    frame = 0
    const area = visibleArea(viewport)
    root.style.setProperty('--viewport-center', `${area.centerY}px`)
    root.style.setProperty('--viewport-height', `${area.height}px`)
  }
  const schedule = () => {
    if (frame === 0) frame = window.requestAnimationFrame(publish)
  }

  publish()
  viewport.addEventListener('resize', schedule)
  viewport.addEventListener('scroll', schedule)
  window.addEventListener('orientationchange', schedule)
  return () => {
    viewport.removeEventListener('resize', schedule)
    viewport.removeEventListener('scroll', schedule)
    window.removeEventListener('orientationchange', schedule)
    if (frame !== 0) window.cancelAnimationFrame(frame)
    root.style.removeProperty('--viewport-center')
    root.style.removeProperty('--viewport-height')
  }
}
