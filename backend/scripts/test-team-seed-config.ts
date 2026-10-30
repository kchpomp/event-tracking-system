import { parseCredentials } from './development-seed-config'

/** Two teams of three; the first five participants get a photo, the sixth has none. */
export const TEST_TEAM_NAMES = ['Тестовая команда А', 'Тестовая команда Б'] as const
export const TEST_USER_COUNT = 6

const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Settings of the test-team seed. Credentials come from `TEST_USER_<n>_EMAIL` / `_PASSWORD` only.
 * The database must be loopback, without a `host`/`hostaddr` override, and `SEED_CONFIRM_DB_HOST`
 * has to equal its host. There is no escape hatch for other hosts.
 */
export function parseTestTeamSeedConfig(source: Record<string, string | undefined>) {
  if (source.NODE_ENV?.trim().toLowerCase() === 'production') {
    throw new Error('The test-team seed is disabled in production')
  }

  const databaseUrl = source.DATABASE_URL?.trim()
  if (!databaseUrl) throw new Error('DATABASE_URL is required for the test-team seed')
  let host: string
  try {
    const parsed = new URL(databaseUrl)
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error('protocol')
    host = parsed.hostname.toLowerCase()
    if (parsed.searchParams.has('host') || parsed.searchParams.has('hostaddr')) throw new Error('override')
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL without a host or hostaddr parameter')
  }
  if (!loopbackHosts.has(host)) throw new Error(`Database host ${host} is not local; the test-team seed runs on loopback only`)

  if (source.SEED_CONFIRM_DB_HOST?.trim().toLowerCase() !== host) {
    throw new Error(`Set SEED_CONFIRM_DB_HOST=${host} to confirm the database this seed writes to`)
  }

  const users = Array.from({ length: TEST_USER_COUNT }, (_, index) =>
    parseCredentials(source, `TEST_USER_${index + 1}`),
  )
  if (new Set(users.map((user) => user.email)).size !== users.length) {
    throw new Error('The TEST_USER_<n>_EMAIL addresses must be different')
  }

  return { admin: parseCredentials(source, 'DEV_SEED_ADMIN'), databaseUrl, host, users }
}
