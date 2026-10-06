import { useCallback, useState } from 'react'

export type Result = {
  variant: 'success' | 'warning' | 'error'
  title: string
  message: string
  /** Runs when the popup closes, by the button or by the timer: the redirect or the camera reopening. */
  onClose?: () => void
  autoCloseMs?: number
}

export function useResultDialog() {
  const [result, setResult] = useState<Result | null>(null)
  const dismiss = useCallback(() => setResult(null), [])
  return { result, show: setResult, dismiss }
}
