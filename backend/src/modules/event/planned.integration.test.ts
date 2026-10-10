import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { createApp } from '../../app'
import { createPrisma } from '../../db'
import { loadEnv } from '../../env'
import { CITY_IDS, COMPANY_IDS } from '../../test-reference-ids'

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required; run bun run test:backend:integration')

const env = loadEnv({
  DATABASE_URL: databaseUrl,
  JWT_SECRET: '12345678901234567890123456789012',
  CORS_ORIGINS: 'http://localhost:5173',
  ACCESS_TOKEN_TTL_SECONDS: '600',
  AUTH_RATE_LIMIT_MAX: '5000',
})

const prisma = createPrisma(databaseUrl)
const app = createApp({ env, prisma })

function signUp(email: string, workplace = true, name = { firstName: 'Анна', lastName: 'Петрова' }) {
  return app.request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: JSON.stringify({
      email,
      password: 'password-1234',
      ...name,
      ...(workplace ? { companyId: COMPANY_IDS[0], cityId: CITY_IDS[0] } : {}),
      consent: true,
    }),
  })
}

async function register(email: string, name?: { firstName: string; lastName: string }) {
  const response = await signUp(email, true, name)
  expect(response.status).toBe(201)
  const body = (await response.json()) as { accessToken: string; user: { id: string } }
  return { accessToken: body.accessToken, id: body.user.id }
}

async function registerAdmin(email: string) {
  const admin = await register(email)
  await prisma.user.update({ where: { id: admin.id }, data: { role: 'admin' } })
  return admin
}

function api(method: string, path: string, accessToken: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

type Summary = { planned: number; registered: number; actual: number }
type Planned = {
  items: {
    id: string
    email: string
    fullName: string | null
    kind: 'participant' | 'hostess'
    registered: boolean
    role: string | null
    userId: string | null
    accountName: string | null
    nameMatches: boolean | null
  }[]
  participants: Summary
  hostesses: Summary
}

const importList = (
  accessToken: string,
  kind: 'participant' | 'hostess',
  entries: { email: string; fullName?: string }[],
) => api('POST', '/api/admin/planned-participants', accessToken, { kind, entries })

describe('reference lists and the planned guest list', () => {
  beforeEach(async () => {
    await prisma.plannedParticipant.deleteMany()
    await prisma.authSession.deleteMany()
    await prisma.user.deleteMany()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  test('the sign-up form reads both lists without an account, in display order', async () => {
    const response = await app.request('/api/registration/reference')
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      companies: { id: string; name: string }[]
      cities: { id: string; name: string }[]
    }
    expect(body.companies).toHaveLength(10)
    expect(body.cities).toHaveLength(10)
    // The order is the stored one (head office first), not alphabetical.
    expect(body.companies.map((item) => item.name).slice(0, 3)).toEqual([
      'СИБУР (головной офис)',
      'ЗапСибНефтехим',
      'СИБУР Тольятти',
    ])
    expect(body.companies.at(-1)?.name).toBe('СибурТюменьГаз')
    expect(body.cities[0]).toEqual({ id: CITY_IDS[0]!, name: 'Москва' })
  })

  test('only an administrator reads or changes the list', async () => {
    const member = await register('member@example.com')
    expect((await api('GET', '/api/admin/planned-participants', member.accessToken)).status).toBe(403)
    expect(
      (
        await importList(member.accessToken, 'participant', [{ email: 'a@example.com' }])
      ).status,
    ).toBe(403)
    expect((await app.request('/api/admin/planned-participants')).status).toBe(401)
  })

  test('an import dedupes by email, keeps names on a repeat, and shows who has signed up', async () => {
    const admin = await registerAdmin('admin@example.com')

    const first = await importList(admin.accessToken, 'participant', [
      { email: ' Anna@Example.com ', fullName: 'Анна Петрова' },
      { email: 'oleg@example.com' },
      { email: 'anna@example.com', fullName: 'Анна П.' }, // the same person again: last name wins
    ])
    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({ added: 2, updated: 0 })

    // A second import adds the new person, names Олег, and never blanks a name already set.
    const second = await importList(admin.accessToken, 'participant', [
      { email: 'anna@example.com' },
      { email: 'oleg@example.com', fullName: 'Олег Иванов' },
      { email: 'maria@example.com' },
    ])
    expect(await second.json()).toEqual({ added: 1, updated: 2 })

    await register('anna@example.com')

    const listed = (await (
      await api('GET', '/api/admin/planned-participants', admin.accessToken)
    ).json()) as Planned
    expect(listed.participants).toEqual({ planned: 3, registered: 1, actual: 1 })
    expect(listed.hostesses).toEqual({ planned: 0, registered: 0, actual: 0 })
    expect(listed.items.map((item) => [item.email, item.fullName, item.registered])).toEqual([
      ['oleg@example.com', 'Олег Иванов', false],
      ['maria@example.com', null, false],
      ['anna@example.com', 'Анна П.', true],
    ])
  })

  test('hostesses are a list of their own: counted apart, and a role is told from an account', async () => {
    const admin = await registerAdmin('admin@example.com')
    await importList(admin.accessToken, 'participant', [{ email: 'guest@example.com' }])
    await importList(admin.accessToken, 'hostess', [
      { email: 'olga@example.com', fullName: 'Ольга Хостесова' },
      { email: 'vera@example.com', fullName: 'Вера Помощникова' },
      { email: 'nina@example.com', fullName: 'Нина Дальняя' },
    ])

    // Ольга has an account and the role; Вера has an account that is still a plain participant.
    const olga = await register('olga@example.com')
    await prisma.user.update({ where: { id: olga.id }, data: { role: 'hostess' } })
    await register('vera@example.com')

    const listed = (await (
      await api('GET', '/api/admin/planned-participants', admin.accessToken)
    ).json()) as Planned
    expect(listed.hostesses).toEqual({ planned: 3, registered: 2, actual: 1 })
    // Vera's account is a participant account: it counts there as an actual participant too.
    expect(listed.participants).toEqual({ planned: 1, registered: 0, actual: 1 })
    const byEmail = Object.fromEntries(listed.items.map((item) => [item.email, item]))
    expect(byEmail['olga@example.com']).toMatchObject({ kind: 'hostess', registered: true, role: 'hostess' })
    expect(byEmail['vera@example.com']).toMatchObject({ kind: 'hostess', registered: true, role: 'user' })
    expect(byEmail['nina@example.com']).toMatchObject({ kind: 'hostess', registered: false, role: null })

    // Importing an address under the other kind moves the person.
    const moved = await importList(admin.accessToken, 'participant', [{ email: 'nina@example.com' }])
    expect(await moved.json()).toEqual({ added: 0, updated: 1 })
    expect((await prisma.plannedParticipant.findUniqueOrThrow({ where: { email: 'nina@example.com' } })).kind).toBe(
      'participant',
    )
  })

  test('an entry can be removed, and removing it twice is a 404', async () => {
    const admin = await registerAdmin('admin@example.com')
    await importList(admin.accessToken, 'participant', [{ email: 'gone@example.com' }])
    const [entry] = await prisma.plannedParticipant.findMany()

    const removed = await api('DELETE', `/api/admin/planned-participants/${entry!.id}`, admin.accessToken)
    expect(removed.status).toBe(200)
    expect(await removed.json()).toEqual({ removed: true })
    expect(await prisma.plannedParticipant.count()).toBe(0)

    const again = await api('DELETE', `/api/admin/planned-participants/${entry!.id}`, admin.accessToken)
    expect(again.status).toBe(404)
  })

  test('an import of nobody, or of a bad address, is a 400', async () => {
    const admin = await registerAdmin('admin@example.com')
    for (const entries of [[], [{ email: 'not-an-email' }]]) {
      const response = await importList(admin.accessToken, 'participant', entries)
      expect(response.status).toBe(400)
    }
    // The kind is required and closed.
    const unknownKind = await api('POST', '/api/admin/planned-participants', admin.accessToken, {
      kind: 'guest',
      entries: [{ email: 'a@example.com' }],
    })
    expect(unknownKind.status).toBe(400)
  })

  test('the list tells whose account is the listed person: the address and both names', async () => {
    const admin = await registerAdmin('admin@example.com')
    await importList(admin.accessToken, 'hostess', [
      { email: 'olga@example.com', fullName: 'Хостесова Ольга' },
      { email: 'vera@example.com', fullName: 'Вера Помощникова' },
      { email: 'nina@example.com' },
      { email: 'zoya@example.com', fullName: 'Зоя Дальняя' },
    ])
    await register('olga@example.com', { firstName: 'Ольга', lastName: 'Хостесова' })
    // The address is listed, but the person who signed up under it has another name.
    await register('vera@example.com', { firstName: 'Анна', lastName: 'Петрова' })
    // Listed without a name: nothing to compare, so no match.
    await register('nina@example.com', { firstName: 'Нина', lastName: 'Ближняя' })

    const listed = (await (
      await api('GET', '/api/admin/planned-participants', admin.accessToken)
    ).json()) as Planned
    const byEmail = Object.fromEntries(listed.items.map((item) => [item.email, item]))
    expect(byEmail['olga@example.com']).toMatchObject({
      accountName: 'Ольга Хостесова',
      nameMatches: true,
    })
    expect(byEmail['olga@example.com']!.userId).toBeString()
    expect(byEmail['vera@example.com']).toMatchObject({ accountName: 'Анна Петрова', nameMatches: false })
    expect(byEmail['nina@example.com']).toMatchObject({ nameMatches: false })
    expect(byEmail['zoya@example.com']).toMatchObject({ userId: null, accountName: null, nameMatches: null })
  })

  test('only an address the organisers listed as a hostess may sign up without a company and a city', async () => {
    const admin = await registerAdmin('admin@example.com')
    await importList(admin.accessToken, 'hostess', [{ email: 'olga@example.com' }])
    await importList(admin.accessToken, 'participant', [{ email: 'guest@example.com' }])

    for (const email of ['stranger@example.com', 'guest@example.com']) {
      const refused = await signUp(email, false)
      expect(refused.status, email).toBe(400)
      expect(await prisma.user.count({ where: { email } })).toBe(0)
    }

    const allowed = await signUp('olga@example.com', false)
    expect(allowed.status).toBe(201)
    const olga = await prisma.user.findUniqueOrThrow({ where: { email: 'olga@example.com' } })
    // She is still a plain account: the role is the administrator to give.
    expect(olga).toMatchObject({ role: 'user', companyId: null, cityId: null })

    // One of the two is not enough for anyone else.
    const half = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
      body: JSON.stringify({
        email: 'half@example.com',
        password: 'password-1234',
        firstName: 'А',
        lastName: 'Б',
        companyId: COMPANY_IDS[0],
        consent: true,
      }),
    })
    expect(half.status).toBe(400)
  })
})
