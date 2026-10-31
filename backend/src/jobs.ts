import type { BackendRuntime } from './runtime'

/**
 * The one place a background job is declared.
 *
 * One of three ways to work off the request path, and the one for *recurring* work:
 *   - `background-tasks.ts` defers best-effort work inside a single API request. Losing it on a
 *     restart is acceptable.
 *   - `outbox/` queues durable one-off work in PostgreSQL. Losing it is not acceptable, so it is
 *     retried until it succeeds or gives up.
 *   - this file declares work that happens on a timer, whether or not anyone asked for it.
 *
 * A task type is never scheduled; one job here, `outbox:drain`, runs every type.
 *
 * **Keep every import in this file a type import.** Tooling outside the backend reads this list
 * without a database, and may run before `prisma:generate` has; a runtime import here would drag
 * the Prisma client and the env schema along. A job that needs a module imports it inside its own
 * body, which also keeps a module's SDKs out of the runs that do not use them.
 *
 * Jobs say what to do; they never say when or where. Three processes run this same registry:
 *   - `cron.ts`      - one-job executor for CLI/system cron or Yandex's HTTP timer adapter
 *   - `scheduler.ts` - a timer inside a long-running process, for a VPS or a cloud worker
 *   - `worker.ts`    - a loop, for work that must run more often than once a minute or in parallel
 *
 * Adding a job here makes it available to all three. See docs/BACKGROUND_JOBS.md.
 */
export type BackgroundJob = (runtime: BackendRuntime, now: Date) => Promise<void>


export const backgroundJobs = {
  noop: async () => {
    console.log('Job noop completed.')
  },
  'db:ping': async ({ prisma }) => {
    await prisma.$queryRaw`SELECT 1`
    console.log('Job db:ping completed.')
  },
  'notifications:process': async (runtime) => {
    const notifications = await loadNotificationsModule(runtime)
    const outbox = await notifications.processOutbox()
    const receipts = await notifications.checkReceipts()
    console.log('Job notifications:process completed.', { outbox, receipts })
  },
  'auth:sessions:cleanup': async (runtime, now) => {
    const { passwordResetTokensDeleted, rateLimitWindowsDeleted, sessionsDeleted } =
      await cleanupAuthState(runtime, now)
    console.log(
      `Job auth:sessions:cleanup removed ${sessionsDeleted} stale sessions, ${passwordResetTokensDeleted} expired password reset tokens and ${rateLimitWindowsDeleted} spent rate-limit windows.`,
    )
  },
  'uploads:pending:cleanup': async ({ prisma, privateStorage }, now) => {
    // An upload whose signed URL has expired can never be finalized, so its row and any bytes
    // that did land are junk. Objects go first: a row deleted before its object would leave
    // storage holding a file nothing points at and nothing will ever look for again.
    const abandoned = await prisma.userAvatar.findMany({
      where: { state: 'pending', expiresAt: { lt: new Date(now.getTime() - 60 * 60 * 1000) } },
      orderBy: { expiresAt: 'asc' },
      take: 500,
    })

    // Only rows whose object is actually gone are deleted. Dropping a row after a failed object
    // delete would strand that object forever: the row is the only record of its key, so nothing
    // would ever look for it again. Keeping the row means the next run simply retries. Deletes
    // are idempotent, so a missing object still counts as removed and cannot block the queue.
    const deletedIds: string[] = []
    for (const upload of abandoned) {
      try {
        await privateStorage.storage.deleteObject(upload.objectKey)
        deletedIds.push(upload.id)
      } catch (error) {
        console.error(`Job uploads:pending:cleanup could not delete ${upload.objectKey}:`, error)
      }
    }

    const rows =
      deletedIds.length > 0
        ? await prisma.userAvatar.deleteMany({ where: { id: { in: deletedIds } } })
        : { count: 0 }

    console.log(
      `Job uploads:pending:cleanup removed ${rows.count} abandoned uploads, and left ${abandoned.length - deletedIds.length} to retry.`,
    )
  },
  'planned-photos:orphans:cleanup': async ({ prisma, privateStorage }, now) => {
    // A ticket whose PUT landed but whose finalize never came (or a file replaced or rejected
    // whose deferred delete was lost) leaves an object no row points at. Anything under the
    // prefix older than a day and unreferenced is junk; younger files may still be finalized.
    const cutoff = now.getTime() - 24 * 60 * 60 * 1000
    const old = (await privateStorage.storage.listObjects('planned-photos/'))
      .filter((object) => object.lastModified.getTime() < cutoff)
      .map((object) => object.key)
    const referenced = new Set(
      (
        await prisma.plannedParticipant.findMany({
          where: { photoObjectKey: { in: old } },
          select: { photoObjectKey: true },
        })
      ).map((row) => row.photoObjectKey),
    )

    let removed = 0
    for (const key of old.filter((candidate) => !referenced.has(candidate))) {
      try {
        await privateStorage.storage.deleteObject(key)
        removed += 1
      } catch (error) {
        console.error(`Job planned-photos:orphans:cleanup could not delete ${key}:`, error)
      }
    }
    console.log(`Job planned-photos:orphans:cleanup removed ${removed} orphaned photos.`)
  },
  'maintenance:process': async (runtime, now) => {
    const { passwordResetTokensDeleted, rateLimitWindowsDeleted, sessionsDeleted } =
      await cleanupAuthState(runtime, now)
    const terminalNotificationOutboxesRedacted = await (
      await loadNotificationsModule(runtime)
    ).redactTerminalData()
    console.log('Job maintenance:process completed.', {
      authSessionsDeleted: sessionsDeleted,
      passwordResetTokensDeleted,
      rateLimitWindowsDeleted,
      terminalNotificationOutboxesRedacted,
    })
  },
  'outbox:drain': async (runtime, now) => {
    const { drainOptionsFromEnv, drainTaskOutbox } = await import('./outbox')
    const metrics = await drainTaskOutbox(runtime, {
      ...drainOptionsFromEnv(runtime.env),
      now,
    })

    // One line, because an operator reads these in a log: `backlog` climbing across runs means
    // the drain cannot keep up, and `unhandled` above zero means rows are queued for a task type
    // this deployment has no handler for.
    console.log('Job outbox:drain completed.', metrics)
  },
} satisfies Record<string, BackgroundJob>

async function loadNotificationsModule({ env, prisma }: BackendRuntime) {
  const { createNotificationsModule } = await import('./modules/notifications')
  return createNotificationsModule({ db: prisma, env })
}


async function cleanupAuthState({ env, prisma }: BackendRuntime, now: Date) {
  const dayMs = 24 * 60 * 60 * 1000
  const retentionCutoff = new Date(
    now.getTime() - env.SESSION_RETENTION_DAYS * dayMs,
  )
  const absoluteRetentionCutoff = new Date(
    now.getTime() - (env.SESSION_ABSOLUTE_TTL_DAYS + env.SESSION_RETENTION_DAYS) * dayMs,
  )
  const absoluteSessionNotBefore = new Date(
    now.getTime() - env.SESSION_ABSOLUTE_TTL_DAYS * dayMs,
  )
  await prisma.$executeRaw`
    UPDATE "push_tokens" AS token
    SET "registration_session_id" = (
      SELECT session."id"
      FROM "auth_sessions" AS session
      WHERE session."user_id" = token."user_id"
        AND session."revoked_at" IS NULL
        AND session."expires_at" > ${now}
        AND session."created_at" > ${absoluteSessionNotBefore}
      ORDER BY session."created_at" DESC, session."id" DESC
      LIMIT 1
    )
    WHERE token."installation_id" IS NULL
      AND token."registration_session_id" IS NULL
  `
  await prisma.$executeRaw`
    DELETE FROM "push_tokens" AS token
    WHERE token."registration_session_id" IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM "auth_sessions" AS session
        WHERE session."id" = token."registration_session_id"
          AND session."user_id" = token."user_id"
          AND session."revoked_at" IS NULL
          AND session."expires_at" > ${now}
          AND session."created_at" > ${absoluteSessionNotBefore}
      )
  `
  const [sessions, passwordResetTokens, rateLimitWindows] = await Promise.all([
    prisma.authSession.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: retentionCutoff } },
          { revokedAt: { lt: retentionCutoff } },
          { createdAt: { lt: absoluteRetentionCutoff } },
        ],
      },
    }),
    prisma.passwordResetToken.deleteMany({
      where: { expiresAt: { lt: now } },
    }),
    // A rate-limit window past its end is never read again - every request looks up the window
    // containing its own clock - so the rows are pure weight. Only RATE_LIMIT_STORE=database
    // writes them; elsewhere this sweeps an empty table.
    prisma.rateLimitBucket.deleteMany({
      where: { expiresAt: { lt: now } },
    }),
  ])
  return {
    passwordResetTokensDeleted: passwordResetTokens.count,
    rateLimitWindowsDeleted: rateLimitWindows.count,
    sessionsDeleted: sessions.count,
  }
}

export type BackgroundJobName = keyof typeof backgroundJobs

export function backgroundJobNames(): BackgroundJobName[] {
  return Object.keys(backgroundJobs) as BackgroundJobName[]
}

export function isBackgroundJobName(value: string): value is BackgroundJobName {
  // `value in backgroundJobs` would also accept 'constructor', 'toString' and the rest of
  // Object.prototype, and those would then run nothing and exit 0 - a provider timer would
  // report a healthy job every night while doing no work.
  return Object.hasOwn(backgroundJobs, value)
}

export async function runBackgroundJob(
  jobName: string,
  runtime: BackendRuntime,
  now = new Date(),
) {
  if (!isBackgroundJobName(jobName)) {
    throw new Error(
      `Unknown job "${jobName}". Available jobs: ${backgroundJobNames().join(', ')}`,
    )
  }

  await backgroundJobs[jobName](runtime, now)
}
