import { createBackendRuntime, type BackendRuntime } from './runtime'
import { checkPushReceipts, processPushOutbox } from './notifications/service'

type WorkerMode = 'notifications' | 'noop'

export async function runWorker(runtime: BackendRuntime, mode: WorkerMode = 'noop') {
  if (mode === 'notifications') {
    await runNotificationsWorker(runtime)
    return
  }

  console.log('Backend worker entrypoint initialized; no background handlers are registered yet.')
}

export async function runNotificationsWorker(
  runtime: BackendRuntime,
  options: {
    pollIntervalMs?: number
    signal?: AbortSignal
  } = {},
) {
  const pollIntervalMs = options.pollIntervalMs ?? 5_000
  console.log(`Notification worker started; polling every ${pollIntervalMs}ms.`)

  while (!options.signal?.aborted) {
    await processPushOutbox(runtime).catch((error: unknown) => {
      console.error('[NotificationWorker] processPushOutbox failed:', error)
    })
    await checkPushReceipts(runtime).catch((error: unknown) => {
      console.error('[NotificationWorker] checkPushReceipts failed:', error)
    })
    await delay(pollIntervalMs, options.signal)
  }
}

export async function main(argv: string[] = Bun.argv.slice(2)) {
  const runtime = createBackendRuntime()
  const mode = argv[0] === 'notifications' ? 'notifications' : 'noop'

  try {
    await runWorker(runtime, mode)
  } finally {
    await runtime.close()
  }
}

if (import.meta.main) {
  await main()
}

function delay(ms: number, signal: AbortSignal | undefined) {
  if (signal?.aborted) return Promise.resolve()

  return new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout)
        resolve()
      },
      { once: true },
    )
  })
}
