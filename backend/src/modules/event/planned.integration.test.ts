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
    firstName: string | null
    lastName: string | null
    department: string | null
    city: string | null
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

type Entry = { email: string; firstName: string; lastName: string; department: string; city: string }

const entry = (email: string, patch: Partial<Entry> = {}): Entry => ({
  email,
  firstName: 'Анна',
  lastName: 'Петрова',
  department: 'СИБУР (головной офис)',
  city: 'Москва',
  ...patch,
})

const importList = (accessToken: string, kind: 'participant' | 'hostess', entries: unknown[]) =>
  api('POST', '/api/admin/planned-participants', accessToken, { kind, entries })

describe('reference lists and the planned guest list', () => {
  beforeEach(async () => {
    await prisma.plannedParticipant.deleteMany()
    await prisma.authSession.deleteMany()
    await prisma.user.deleteMany()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  test('a full 2000-row import fits its body limit, while other admin bodies keep the small one', async () => {
    const admin = await registerAdmin('admin@example.com')
    const entries = Array.from({ length: 2000 }, (_, n) =>
      entry(`guest${n}@example.com`, { firstName: 'Имя'.repeat(20), lastName: 'Фамилия'.repeat(10), department: 'Д'.repeat(80) }),
    )
    expect(JSON.stringify({ kind: 'participant', entries }).length).toBeGreaterThan(65_536 * 4)
    const done = await importList(admin.accessToken, 'participant', entries)
    expect(done.status).toBe(200)
    expect(await done.json()).toEqual({ added: 2000, updated: 0 })

    const huge = await api('POST', '/api/admin/planned-participants', admin.accessToken, { pad: 'x'.repeat(2 * 1024 * 1024) })
    expect(huge.status).toBe(413)
    const small = await api('POST', '/api/admin/planned-participants/photos/tickets', admin.accessToken, { pad: 'x'.repeat(100_000) })
    expect(small.status).toBe(413)
  })

  test('the sign-up form keeps the standing lists and gains the departments and cities of an import', async () => {
    const empty = await app.request('/api/registration/reference')
    expect(empty.status).toBe(200)
    const standing = (await empty.json()) as { companies: { name: string }[]; cities: { name: string }[] }
    expect(standing.companies.length).toBeGreaterThan(0)
    expect(standing.cities.length).toBeGreaterThan(0)

    const admin = await registerAdmin('admin@example.com')
    await importList(admin.accessToken, 'participant', [
      entry('a@example.com', { department: 'Яр завод', city: 'Тобольск' }),
      entry('b@example.com', { department: 'Ант завод', city: 'Москва' }),
      entry('c@example.com', { department: 'Яр завод', city: 'Тобольск' }),
    ])
    // Hostesses do not make the participants' dropdowns longer.
    await importList(admin.accessToken, 'hostess', [
      entry('h@example.com', { department: 'Только хостесса', city: 'Городок хостессы' }),
    ])

    const response = await app.request('/api/registration/reference')
    const text = await response.text()
    const body = JSON.parse(text) as {
      companies: { id: string; name: string }[]
      cities: { id: string; name: string }[]
    }
    expect(Object.keys(body).sort()).toEqual(['cities', 'companies'])
    const names = (items: { name: string }[]) => items.map((item) => item.name)
    expect(names(body.companies)).toEqual(expect.arrayContaining([...names(standing.companies), 'Ант завод', 'Яр завод']))
    expect(names(body.cities)).toEqual(expect.arrayContaining([...names(standing.cities), 'Москва', 'Тобольск']))
    // An existing row keeps its id, so a sign-up that posts it stays valid.
    expect(body.cities.find((item) => item.id === CITY_IDS[0]!)).toBeDefined()
    expect(text).not.toContain('@')
    expect(text).not.toContain('Петрова')

    // The listed ids are the ones a sign-up accepts.
    const signedUp = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
      body: JSON.stringify({
        email: 'new@example.com',
        password: 'password-1234',
        firstName: 'Анна',
        lastName: 'Петрова',
        companyId: body.companies[0]!.id,
        cityId: body.cities[0]!.id,
        consent: true,
      }),
    })
    expect(signedUp.status).toBe(201)
  })

  test('only an administrator reads or changes the list', async () => {
    const member = await register('member@example.com')
    expect((await api('GET', '/api/admin/planned-participants', member.accessToken)).status).toBe(403)
    expect(
      (
        await importList(member.accessToken, 'participant', [entry('a@example.com')])
      ).status,
    ).toBe(403)
    expect((await app.request('/api/admin/planned-participants')).status).toBe(401)
  })

  test('an import dedupes by email, replaces the columns on a repeat, and shows who has signed up', async () => {
    const admin = await registerAdmin('admin@example.com')

    const first = await importList(admin.accessToken, 'participant', [
      entry(' Anna@Example.com '),
      entry('oleg@example.com', { firstName: 'Олег', lastName: 'Иванов' }),
      entry('anna@example.com', { lastName: 'Павлова', city: 'Тобольск' }), // the same person again: last row wins
    ])
    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({ added: 2, updated: 0 })

    const second = await importList(admin.accessToken, 'participant', [
      entry('anna@example.com', { lastName: 'Павлова', city: 'Тобольск' }),
      entry('oleg@example.com', { firstName: 'Олег', lastName: 'Иванов', department: 'ЗапСибНефтехим' }),
      entry('maria@example.com', { firstName: 'Мария', lastName: 'Сидорова' }),
    ])
    expect(await second.json()).toEqual({ added: 1, updated: 2 })

    await register('anna@example.com')

    const listed = (await (
      await api('GET', '/api/admin/planned-participants', admin.accessToken)
    ).json()) as Planned
    expect(listed.participants).toEqual({ planned: 3, registered: 1, actual: 1 })
    expect(listed.hostesses).toEqual({ planned: 0, registered: 0, actual: 0 })
    expect(
      listed.items.map((item) => [item.email, item.lastName, item.department, item.city, item.registered]),
    ).toEqual([
      ['oleg@example.com', 'Иванов', 'ЗапСибНефтехим', 'Москва', false],
      ['maria@example.com', 'Сидорова', 'СИБУР (головной офис)', 'Москва', false],
      ['anna@example.com', 'Павлова', 'СИБУР (головной офис)', 'Тобольск', true],
    ])
  })

  test('hostesses are a list of their own: counted apart, and a role is told from an account', async () => {
    const admin = await registerAdmin('admin@example.com')
    await importList(admin.accessToken, 'participant', [entry('guest@example.com')])
    await importList(admin.accessToken, 'hostess', [
      entry('olga@example.com', { firstName: 'Ольга', lastName: 'Хостесова' }),
      entry('vera@example.com', { firstName: 'Вера', lastName: 'Помощникова' }),
      entry('nina@example.com', { firstName: 'Нина', lastName: 'Дальняя' }),
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
    const moved = await importList(admin.accessToken, 'participant', [entry('nina@example.com')])
    expect(await moved.json()).toEqual({ added: 0, updated: 1 })
    expect((await prisma.plannedParticipant.findUniqueOrThrow({ where: { email: 'nina@example.com' } })).kind).toBe(
      'participant',
    )
  })

  test('an entry can be removed, and removing it twice is a 404', async () => {
    const admin = await registerAdmin('admin@example.com')
    await importList(admin.accessToken, 'participant', [entry('gone@example.com')])
    const [row] = await prisma.plannedParticipant.findMany()

    const removed = await api('DELETE', `/api/admin/planned-participants/${row!.id}`, admin.accessToken)
    expect(removed.status).toBe(200)
    expect(await removed.json()).toEqual({ removed: true })
    expect(await prisma.plannedParticipant.count()).toBe(0)

    const again = await api('DELETE', `/api/admin/planned-participants/${row!.id}`, admin.accessToken)
    expect(again.status).toBe(404)
  })

  test('an import of nobody, or of a bad kind, is a 400', async () => {
    const admin = await registerAdmin('admin@example.com')
    const empty = await importList(admin.accessToken, 'participant', [])
    expect(empty.status).toBe(400)
    expect(((await empty.json()) as { error: { message: string } }).error.message).toContain('список пуст')
    const unknownKind = await api('POST', '/api/admin/planned-participants', admin.accessToken, {
      kind: 'guest',
      entries: [entry('a@example.com')],
    })
    expect(unknownKind.status).toBe(400)
  })

  test('a malformed row is refused whole, with a Russian message naming the row and the problem', async () => {
    const admin = await registerAdmin('admin@example.com')
    const refuse = async (entries: unknown[]) => {
      const response = await importList(admin.accessToken, 'participant', entries)
      expect(response.status).toBe(400)
      const body = (await response.json()) as { error: { code: string; message: string } }
      expect(body.error.code).toBe('VALIDATION_ERROR')
      return body.error.message
    }

    const good = entry('good@example.com')
    expect(await refuse([good, entry('not-an-email')])).toBe('Строка 2: в колонке «email» не адрес почты')
    expect(await refuse([good, good, entry('b@example.com', { city: '  ' })])).toBe('Строка 3: колонка «город» пуста')
    expect(await refuse([{ email: 'b@example.com', firstName: 'Анна', lastName: 'Петрова', city: 'Москва' }])).toContain(
      'Строка 1: нет колонки «подразделение»',
    )
    expect(await refuse([{ ...good, fullName: 'Анна Петрова' }])).toContain('Строка 1: лишняя колонка «fullName»')
    expect(await refuse([entry('b@example.com', { department: 'x'.repeat(101) })])).toContain('«подразделение» длиннее')

    // Nothing of a refused file is stored, not even its good rows or its departments.
    expect(await prisma.plannedParticipant.count()).toBe(0)
    expect(await prisma.company.count({ where: { name: 'x'.repeat(101) } })).toBe(0)
  })

  test('the list tells whose account is the listed person: the address and both names', async () => {
    const admin = await registerAdmin('admin@example.com')
    await importList(admin.accessToken, 'hostess', [
      entry('olga@example.com', { firstName: 'Ольга', lastName: 'Хостесова' }),
      entry('vera@example.com', { firstName: 'Вера', lastName: 'Помощникова' }),
      entry('zoya@example.com', { firstName: 'Зоя', lastName: 'Дальняя' }),
    ])
    // A row loaded before the five-column format has no names.
    await prisma.plannedParticipant.create({ data: { email: 'nina@example.com', kind: 'hostess' } })
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
    await importList(admin.accessToken, 'hostess', [entry('olga@example.com')])
    await importList(admin.accessToken, 'participant', [entry('guest@example.com')])

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
