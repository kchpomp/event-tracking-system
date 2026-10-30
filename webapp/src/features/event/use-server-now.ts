import { useEffect, useState } from 'react'

import { serverClockOffset } from './schedule-model'

/**
 * "Now" on the server clock, recomputed every `tickMs`. `serverNow` came with the response that
 * the device received at `fetchedAt`; before any response it falls back to the device clock.
 */
export function useServerNow(
  reading: { serverNow: string; fetchedAt: number } | null,
  tickMs: number,
) {
  const [deviceNow, setDeviceNow] = useState(Date.now)
  useEffect(() => {
    const id = setInterval(() => setDeviceNow(Date.now()), tickMs)
    return () => clearInterval(id)
  }, [tickMs])
  if (!reading) return deviceNow
  // After a refetch the tick can be older than the reading: never go back before the reading.
  return Math.max(deviceNow, reading.fetchedAt) + serverClockOffset(reading.serverNow, reading.fetchedAt)
}
