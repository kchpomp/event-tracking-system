import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { createApp } from '../../app'
import { createPrisma } from '../../db'
import { loadEnv } from '../../env'
import { orderedPair } from './domain/rules'
import { CITY_IDS, COMPANY_IDS } from '../../test-reference-ids'
import { seedEvent } from './infrastructure/event-seed'

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required; run bun run test:backend:integration')

const env = loadEnv({
  DATABASE_URL: databaseUrl,
  JWT_SECRET: '12345678901234567890123456789012',
  CORS_ORIGINS: 'http://localhost:5173',
  ACCESS_TOKEN_TTL_SECONDS: '600',
  // This suite makes many requests from one in-process client.
  AUTH_RATE_LIMIT_MAX: '5000',
})

const prisma = createPrisma(databaseUrl)
const app = createApp({ env, prisma })

type Person = { accessToken: string; id: string; qr: string }
type NetworkBody = { nodes: { id: string; initials: string }[]; edges: { a: string; b: string }[] }

let counter = 0
async function register(overrides: Record<string, unknown> = {}): Promise<Person> {
  counter += 1
  const response = await app.request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: JSON.stringify({
      email: `network${counter}-${crypto.randomUUID()}@example.com`,
      password: 'password-1234',
      firstName: `Имя${counter}`,
      lastName: `Фамилия${counter}`,
      companyId: COMPANY_IDS[counter % 10],
      cityId: CITY_IDS[counter % 10],
      consent: true,
      ...overrides,
    }),
  })
  expect(response.status).toBe(201)
  const body = (await response.json()) as { accessToken: string; user: { id: string } }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: body.user.id } })
  return { accessToken: body.accessToken, id: body.user.id, qr: user.personalQrToken }
}

async function makeStaff(role: 'admin' | 'hostess') {
  const person = await register()
  await prisma.user.update({ where: { id: person.id }, data: { role } })
  return person
}

function get(path: string, accessToken: string, headers: Record<string, string> = {}, target = app) {
  return target.request(path, { headers: { Authorization: `Bearer ${accessToken}`, ...headers } })
}

const connect = (person: Person, token: string) =>
  app.request('/api/event/diffusion/connections', {
    method: 'POST',
    headers: { Authorization: `Bearer ${person.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })

async function network(admin: Person) {
  const response = await get('/api/admin/network', admin.accessToken)
  expect(response.status).toBe(200)
  return (await response.json()) as NetworkBody
}

describe('venue network screen API', () => {
  beforeEach(async () => {
    await prisma.event.deleteMany()
    await prisma.authSession.deleteMany()
    await prisma.user.deleteMany() // connections cascade
    await prisma.rateLimitBucket.deleteMany()
    await seedEvent(prisma)
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  test('only administrators read the network: participants and hostesses get 403', async () => {
    const participant = await register()
    const hostess = await makeStaff('hostess')
    const admin = await makeStaff('admin')

    expect((await app.request('/api/admin/network')).status).toBe(401)
    expect((await get('/api/admin/network', participant.accessToken)).status).toBe(403)
    expect((await get('/api/admin/network', hostess.accessToken)).status).toBe(403)
    expect((await get('/api/admin/network', admin.accessToken)).status).toBe(200)
  })

  test('nodes are participants only, with initials and nothing else; staff and their links are left out', async () => {
    const ivan = await register({ firstName: 'Иван', lastName: 'Кремнев' })
    const yolka = await register({ firstName: ' ёлка', lastName: 'Римская-Корсакова' })
    const hostess = await makeStaff('hostess')
    const admin = await makeStaff('admin')
    // A participant may have scanned a staff member's personal QR; that line is not shown either.
    const [a, b] = orderedPair(ivan.id, hostess.id)
    await prisma.connection.create({ data: { participantA: a, participantB: b } })

    const response = await get('/api/admin/network', admin.accessToken)
    const text = await response.text()
    const body = JSON.parse(text) as NetworkBody

    expect(body.nodes).toEqual([
      { id: ivan.id, initials: 'ИК' },
      { id: yolka.id, initials: 'ЁР' },
    ])
    expect(body.edges).toEqual([])
    for (const secret of ['Иван', 'Кремнев', 'Тюмень', 'Завод', ivan.qr, '@example.com']) {
      expect(text).not.toContain(secret)
    }
  })

  test('A scanning B and then B scanning A is exactly one edge, stored lowest id first', async () => {
    const admin = await makeStaff('admin')
    const a = await register()
    const b = await register()
    const c = await register()

    expect((await connect(a, b.qr)).status).toBe(200)
    expect((await connect(b, a.qr)).status).toBe(200)
    expect((await connect(c, b.qr)).status).toBe(200)

    const [low, high] = orderedPair(a.id, b.id)
    const [low2, high2] = orderedPair(b.id, c.id)
    const body = await network(admin)
    expect(body.edges).toHaveLength(2)
    expect(body.edges).toContainEqual({ a: low, b: high })
    expect(body.edges).toContainEqual({ a: low2, b: high2 })
    expect(body.nodes.map((node) => node.id)).toEqual([a.id, b.id, c.id])
  })

  test('the screen has its own read budget per administrator, apart from the account budget of the address', async () => {
    const admin = await makeStaff('admin')
    const otherAdmin = await makeStaff('admin')
    const budgetApp = createApp({
      env: {
        ...env,
        ADMIN_NETWORK_READ_RATE_LIMIT_MAX: 2,
        AUTH_RATE_LIMIT_MAX: 1,
        TRUST_PROXY: true,
        TRUSTED_PROXY_CLIENT_IP_HEADER: 'x-forwarded-for',
      },
      prisma,
    })
    const venue = { 'X-Forwarded-For': '203.0.113.50' }
    const read = (person: Person) => get('/api/admin/network', person.accessToken, venue, budgetApp)
    const rename = () =>
      budgetApp.request('/api/users/me', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${admin.accessToken}`, 'Content-Type': 'application/json', ...venue },
        body: JSON.stringify({ displayName: 'Экран площадки' }),
      })

    // The phones at the venue spend the account budget of the shared address; the screen still reads.
    expect((await rename()).status).toBe(200)
    expect((await rename()).status).toBe(429)
    expect((await read(admin)).status).toBe(200)
    expect((await read(admin)).status).toBe(200)

    // A screen that polls too fast is stopped on its own, and another administrator is not.
    const limited = await read(admin)
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBeTruthy()
    expect((await read(otherAdmin)).status).toBe(200)
  })
})
