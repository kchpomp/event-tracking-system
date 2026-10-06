// The webapp copy is Russian-only (`index.html` declares `lang="ru"`), so dates are pinned to
// the same locale instead of following the browser: one screen must not read "5 мар. 2026 г."
// while the next reads "05.03.2026".
const uiLocale = 'ru'

const dateFormatter = new Intl.DateTimeFormat(uiLocale, { dateStyle: 'medium' })

/**
 * Formats a timestamp as the calendar day the UI shows for it, e.g. `5 мар. 2026 г.`, in the
 * viewer's time zone. Accepts the ISO strings the contracts carry or an already parsed `Date`.
 */
export function formatDate(value: Date | string): string {
  return dateFormatter.format(value instanceof Date ? value : new Date(value))
}
