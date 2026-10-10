import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { createApp } from './app'
import { createPrisma } from './db'
import { loadEnv } from './env'
import { CITY_IDS, COMPANY_IDS } from './test-reference-ids'

/**
 * What an attacker, or a person with the wrong role, can and cannot do. The functional suites prove
 * the happy path; this one proves the doors are shut: every protected route for every role, the
 * request shapes that are classic injection and mass-assignment attempts, and the cross-origin and
 * size limits. Add a route to the matrix when you add a route.
 */

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required; run bun run test:backend:integration')

const env = loadEnv({
  DATABASE_URL: databaseUrl,
  JWT_SECRET: '12345678901234567890123456789012',
  CORS_ORIGINS: 'http://localhost:5173',
  ACCESS_TOKEN_TTL_SECONDS: '600',
  AUTH_RATE_LIMIT_MAX: '5000',
  EVENT_RATE_LIMIT_MAX: '5000',
})

const prisma = createPrisma(databaseUrl)
const app = createApp({ env, prisma })
const ORIGIN = 'http://localhost:5173'
const SOME_UUID = '01990000-0000-7000-8000-00000000ffff'

type Role = 'user' | 'hostess' | 'admin'
type Account = { accessToken: string; id: string; role: Role }

let counter = 0
async function account(role: Role): Promise<Account> {
  counter += 1
  const response = await app.request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({
      email: `${role}-${counter}-${crypto.randomUUID()}@example.com`,
      password: 'password-1234',
      firstName: 'Тест',
      lastName: `Роль${counter}`,
      companyId: COMPANY_IDS[0],
      cityId: CITY_IDS[0],
      consent: true,
    }),
  })
  expect(response.status).toBe(201)
  const body = (await response.json()) as { accessToken: string; user: { id: string } }
  if (role !== 'user') {
    // Roles are read from the database on every request, so the same token now carries the role.
    await prisma.user.update({ where: { id: body.user.id }, data: { role } })
  }
  return { accessToken: body.accessToken, id: body.user.id, role }
}

function call(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return app.request(path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      Origin: ORIGIN,
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

type Area = 'event' | 'hostess' | 'admin'
type Door = { area: Area; method: string; path: string; body?: unknown }

// Every protected route. Bodies are well-formed enough to get past validation when the role is allowed.
const doors: Door[] = [
  { area: 'event', method: 'GET', path: '/api/event/me' },
  { area: 'event', method: 'GET', path: '/api/event/stations' },
  { area: 'event', method: 'GET', path: '/api/event/leaderboard' },
  { area: 'event', method: 'POST', path: '/api/event/scan', body: { token: 'nope' } },
  { area: 'event', method: 'POST', path: '/api/event/diffusion/connections', body: { token: 'nope' } },
  {
    area: 'event',
    method: 'POST',
    path: '/api/event/ideas',
    body: { title: 'a', direction: 'b', problem: 'c', description: 'd', expectedResult: 'e' },
  },
  { area: 'hostess', method: 'GET', path: '/api/hostess/participants?q=ab' },
  { area: 'hostess', method: 'POST', path: '/api/hostess/participants/resolve', body: { token: 'nope' } },
  { area: 'hostess', method: 'GET', path: `/api/hostess/participants/${SOME_UUID}` },
  {
    area: 'hostess',
    method: 'POST',
    path: '/api/hostess/awards',
    body: { participantId: SOME_UUID, stationId: SOME_UUID },
  },
  { area: 'admin', method: 'GET', path: '/api/admin/dashboard' },
  { area: 'admin', method: 'GET', path: '/api/admin/users' },
  { area: 'admin', method: 'PATCH', path: `/api/admin/users/${SOME_UUID}/role`, body: { role: 'admin' } },
  { area: 'admin', method: 'GET', path: '/api/admin/stations' },
  { area: 'admin', method: 'PATCH', path: '/api/admin/event', body: { isActive: true } },
  { area: 'admin', method: 'GET', path: '/api/admin/planned-participants' },
  {
    area: 'admin',
    method: 'POST',
    path: '/api/admin/planned-participants',
    body: { kind: 'participant', entries: [{ email: 'matrix@example.com' }] },
  },
  { area: 'admin', method: 'DELETE', path: `/api/admin/planned-participants/${SOME_UUID}` },
]

// What each role may reach. Administrators run the hostess desk too; nobody else crosses over.
const reaches: Record<Role, Area[]> = {
  user: ['event'],
  hostess: ['hostess'],
  admin: ['hostess', 'admin'],
}

async function clean() {
  await prisma.plannedParticipant.deleteMany()
  await prisma.event.deleteMany()
  await prisma.authSession.deleteMany()
  await prisma.user.deleteMany()
}

describe('access control', () => {
  beforeEach(clean)

  afterAll(async () => {
    await prisma.$disconnect()
  })

  test('every protected route refuses a caller with no token or a forged one', async () => {
    const real = await account('admin')
    const [header, payload, signature] = real.accessToken.split('.')
    const forged = [
      'not-a-token',
      `${header}.${payload}.${signature!.slice(0, -2)}xx`, // signature tampered
      `${header}.${Buffer.from(JSON.stringify({ sub: real.id, role: 'admin' })).toString('base64url')}.${signature}`,
      `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${payload}.`,
    ]

    for (const door of doors) {
      const anonymous = await call(door.method, door.path, undefined, door.body)
      expect(anonymous.status, `${door.method} ${door.path} without a token`).toBe(401)
      for (const token of forged) {
        const response = await call(door.method, door.path, token, door.body)
        expect(response.status, `${door.method} ${door.path} with a forged token`).toBe(401)
      }
    }
  })

  test('each role reaches only its own areas', async () => {
    const accounts = await Promise.all((['user', 'hostess', 'admin'] as const).map((role) => account(role)))

    for (const who of accounts) {
      for (const door of doors) {
        const response = await call(door.method, door.path, who.accessToken, door.body)
        const label = `${who.role} ${door.method} ${door.path}`
        if (reaches[who.role].includes(door.area)) {
          expect([401, 403], label).not.toContain(response.status)
        } else {
          expect(response.status, label).toBe(403)
        }
      }
    }
  })

  test('a participant cannot make themselves anything else', async () => {
    const user = await account('user')
    const refused = await call('PATCH', `/api/admin/users/${user.id}/role`, user.accessToken, { role: 'admin' })
    expect(refused.status).toBe(403)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe('user')

    // The profile endpoint changes the display name and nothing else, whatever else is sent.
    const sneaky = await call('PATCH', '/api/users/me', user.accessToken, {
      displayName: 'Новое имя',
      role: 'admin',
      email: 'someone-else@example.com',
    })
    expect([200, 400]).toContain(sneaky.status)
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(after.role).toBe('user')
    expect(after.email).not.toBe('someone-else@example.com')
  })

  test('a role change ends the old sessions, so a token cannot outlive it', async () => {
    const admin = await account('admin')
    const user = await account('user')
    expect((await call('GET', '/api/event/me', user.accessToken)).status).toBe(200)

    const promoted = await call('PATCH', `/api/admin/users/${user.id}/role`, admin.accessToken, {
      role: 'hostess',
    })
    expect(promoted.status).toBe(200)
    expect((await call('GET', '/api/event/me', user.accessToken)).status).toBe(401)
  })
})

describe('hostile input', () => {
  beforeEach(clean)

  test('registration ignores fields that are not the person to set', async () => {
    const email = `mass-${crypto.randomUUID()}@example.com`
    const response = await call('POST', '/api/auth/register', undefined, {
      email,
      password: 'password-1234',
      firstName: 'Мария',
      lastName: 'Сидорова',
      companyId: COMPANY_IDS[0],
      cityId: CITY_IDS[0],
      consent: true,
      role: 'admin',
      id: SOME_UUID,
      consentedAt: '2000-01-01T00:00:00.000Z',
      personalQrToken: 'chosen-by-attacker',
    })
    expect(response.status).toBe(201)
    const user = await prisma.user.findUniqueOrThrow({ where: { email } })
    expect(user.role).toBe('user')
    expect(user.id).not.toBe(SOME_UUID)
    expect(user.personalQrToken).not.toBe('chosen-by-attacker')
    expect(user.consentedAt!.getFullYear()).toBeGreaterThan(2000)
  })

  test('quotes, SQL and markup in names and search are data, never code', async () => {
    const admin = await account('admin')
    const hostile = [`'); DROP TABLE users; --`, `' OR '1'='1`, '<script>alert(1)</script>', '%', '_', '\\']

    for (const text of hostile) {
      const search = await call(
        'GET',
        `/api/hostess/participants?q=${encodeURIComponent(text.padEnd(2, ' '))}`,
        admin.accessToken,
      )
      expect([200, 400], text).toContain(search.status)
      if (search.status === 200) {
        // A wildcard typed by a person is a character, not a pattern that matches everyone.
        const { participants } = (await search.json()) as { participants: unknown[] }
        expect(participants, text).toEqual([])
      }
    }

    const imported = await call('POST', '/api/admin/planned-participants', admin.accessToken, {
      kind: 'hostess',
      entries: [{ email: 'inject@example.com', fullName: `Robert'); DROP TABLE planned_participants;--` }],
    })
    expect(imported.status).toBe(200)
    const listed = (await (await call('GET', '/api/admin/planned-participants', admin.accessToken)).json()) as {
      items: { fullName: string | null }[]
    }
    expect(listed.items[0]?.fullName).toBe(`Robert'); DROP TABLE planned_participants;--`)

    // Markup is stored as typed and sent as JSON with the headers that stop a browser guessing HTML.
    const person = await call('POST', '/api/auth/register', undefined, {
      email: `xss-${crypto.randomUUID()}@example.com`,
      password: 'password-1234',
      firstName: '<img src=x onerror=alert(1)>',
      lastName: 'Тест',
      companyId: COMPANY_IDS[0],
      cityId: CITY_IDS[0],
      consent: true,
    })
    expect(person.status).toBe(201)
    const response = await call('GET', '/api/admin/users', admin.accessToken)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await prisma.user.count()).toBeGreaterThan(1) // the tables are all still there
  })

  test('a cookie-session request from another site is refused, as it is in production', async () => {
    // The cookie flows check the Origin only where cookies are secure, which is production.
    const secureEnv = loadEnv({
      DATABASE_URL: databaseUrl,
      // Secure cookies make the environment check the secret like production does.
      JWT_SECRET: `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', ''),
      CORS_ORIGINS: 'https://app.example.com',
      COOKIE_SECURE: 'true',
      AUTH_RATE_LIMIT_MAX: '5000',
    })
    const secureApp = createApp({ env: secureEnv, prisma })
    const send = (path: string, origin: string | undefined, body: unknown) =>
      secureApp.request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
        body: JSON.stringify(body),
      })

    const person = {
      email: `csrf-${crypto.randomUUID()}@example.com`,
      password: 'password-1234',
      firstName: 'А',
      lastName: 'Б',
      companyId: COMPANY_IDS[0],
      cityId: CITY_IDS[0],
      consent: true,
    }
    for (const origin of ['https://evil.example', undefined]) {
      expect((await send('/api/auth/register', origin, person)).status, String(origin)).toBe(403)
      expect((await send('/api/auth/login', origin, person)).status, String(origin)).toBe(403)
      expect((await send('/api/auth/refresh', origin, {})).status, String(origin)).toBe(403)
      expect((await send('/api/auth/logout', origin, {})).status, String(origin)).toBe(403)
    }
    expect(await prisma.user.count({ where: { email: person.email } })).toBe(0)

    // The real site is let in.
    expect((await send('/api/auth/register', 'https://app.example.com', person)).status).toBe(201)
  })

  test('a browser from another site is not given the API', async () => {
    const preflight = await app.request('/api/admin/users', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://evil.example',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization',
      },
    })
    expect(preflight.headers.get('access-control-allow-origin')).not.toBe('https://evil.example')
    expect(preflight.headers.get('access-control-allow-origin')).not.toBe('*')
  })

  test('an oversized body is refused before it is read', async () => {
    const huge = 'x'.repeat(2 * 1024 * 1024)
    const response = await call('POST', '/api/auth/login', undefined, { email: 'a@example.com', password: huge })
    expect(response.status).toBe(413)
  })

  test('the same answer for an unknown address and a wrong password, so accounts cannot be probed', async () => {
    const user = await account('user')
    const email = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email

    const unknown = await call('POST', '/api/auth/login', undefined, {
      email: 'nobody@example.com',
      password: 'password-1234',
    })
    const wrong = await call('POST', '/api/auth/login', undefined, { email, password: 'wrong-password-1' })
    expect(unknown.status).toBe(401)
    expect(wrong.status).toBe(401)
    expect(await unknown.json()).toEqual(await wrong.json())
  })

  test('the public lists leak nothing about people', async () => {
    const reference = await call('GET', '/api/registration/reference')
    expect(reference.status).toBe(200)
    expect(await reference.text()).not.toMatch(/email|password|token|@/i)
  })
})
