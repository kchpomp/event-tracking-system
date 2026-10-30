import { describe, expect, test } from 'bun:test'

import { parseTestTeamSeedConfig } from './test-team-seed-config'

const users = Object.fromEntries(
  [1, 2, 3, 4, 5, 6].flatMap((n) => [
    [`TEST_USER_${n}_EMAIL`, `test${n}@example.invalid`],
    [`TEST_USER_${n}_PASSWORD`, `placeholder-password-${n}`],
  ]),
)
const valid = {
  DATABASE_URL: 'postgresql://app:pw@localhost:54329/event_tracking_system?schema=public',
  SEED_CONFIRM_DB_HOST: 'localhost',
  DEV_SEED_ADMIN_EMAIL: 'admin@example.com',
  DEV_SEED_ADMIN_PASSWORD: 'local-admin-password',
  ...users,
}

describe('test-team seed configuration', () => {
  test('accepts a confirmed local database with six accounts', () => {
    const config = parseTestTeamSeedConfig(valid)
    expect(config.users).toHaveLength(6)
    expect(config.users[0]).toEqual({ email: 'test1@example.invalid', password: 'placeholder-password-1' })
  })

  test('refuses without a confirmation that names the host, or a wrong one', () => {
    expect(() => parseTestTeamSeedConfig({ ...valid, SEED_CONFIRM_DB_HOST: undefined })).toThrow('SEED_CONFIRM_DB_HOST=localhost')
    expect(() => parseTestTeamSeedConfig({ ...valid, SEED_CONFIRM_DB_HOST: 'db.internal' })).toThrow('SEED_CONFIRM_DB_HOST')
  })

  test('refuses a non-local host with no override, and production always', () => {
    const remote = { ...valid, DATABASE_URL: 'postgresql://a:b@db.example.org/x', SEED_CONFIRM_DB_HOST: 'db.example.org' }
    expect(() => parseTestTeamSeedConfig(remote)).toThrow('not local')
    expect(() => parseTestTeamSeedConfig({ ...remote, SEED_ALLOW_NON_LOCAL_DB: '1' })).toThrow('not local')
    expect(() => parseTestTeamSeedConfig({ ...valid, NODE_ENV: 'production' })).toThrow('production')
  })

  test('refuses a host or hostaddr parameter that overrides the loopback host', () => {
    for (const q of ['host=db.example.org', 'hostaddr=10.0.0.1']) {
      expect(() => parseTestTeamSeedConfig({ ...valid, DATABASE_URL: `postgresql://a:b@localhost/x?${q}` })).toThrow('host or hostaddr')
    }
  })

  test('refuses missing credentials and repeated emails', () => {
    expect(() => parseTestTeamSeedConfig({ ...valid, TEST_USER_3_PASSWORD: undefined })).toThrow('TEST_USER_3_PASSWORD')
    expect(() => parseTestTeamSeedConfig({ ...valid, TEST_USER_2_EMAIL: 'test1@example.invalid' })).toThrow('different')
  })
})
