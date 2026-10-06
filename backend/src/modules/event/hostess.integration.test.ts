import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { createApp } from '../../app'
import { createPrisma } from '../../db'
import { loadEnv } from '../../env'
import { seedEvent } from './infrastructure/event-seed'

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

type Person = { accessToken: string; id: string; qr: string }

let counter = 0
async function register(overrides: Record<string, unknown> = {}): Promise<Person> {
  counter += 1
  const response = await app.request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: JSON.stringify({
      email: `person${counter}-${crypto.randomUUID()}@example.com`,
      password: 'password-1234',
      firstName: `Имя${counter}`,
      lastName: `Фамилия${counter}`,
      company: `Предприятие ${counter}`,
      city: `Город ${counter}`,
      consent: true, privacyPolicy: true,
      ...overrides,
    }),
  })
  expect(response.status).toBe(201)
  const body = (await response.json()) as { accessToken: string; user: { id: string } }
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: body.user.id },
    select: { personalQrToken: true },
  })
  return { accessToken: body.accessToken, id: body.user.id, qr: user.personalQrToken }
}

function api(method: string, path: string, accessToken: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

/** The role is read from the database on every request, so promoting after sign-up is enough. */
async function makeStaff(role: 'hostess' | 'admin') {
  const person = await register({ firstName: role === 'admin' ? 'Админ' : 'Хостес' })
  await prisma.user.update({ where: { id: person.id }, data: { role } })
  return person
}

const search = (staff: Person, q: string) =>
  api('GET', `/api/hostess/participants?q=${encodeURIComponent(q)}`, staff.accessToken)
const award = (staff: Person, participantId: string, stationId: string) =>
  api('POST', '/api/hostess/awards', staff.accessToken, { participantId, stationId })
const scan = (person: Person, token: string) =>
  api('POST', '/api/event/scan', person.accessToken, { token })

const stationNamed = (name: string) => prisma.station.findFirstOrThrow({ where: { name } })
const polymerPlace = (points: number) =>
  prisma.station.findFirstOrThrow({ where: { displayGroup: 'polymer_solutions', points } })

async function errorCode(response: Response) {
  return ((await response.json()) as { error: { code: string } }).error.code
}

async function totalPoints(participantId: string) {
  return (
    (await prisma.activityLog.aggregate({ where: { participantId }, _sum: { pointsAwarded: true } }))
      ._sum.pointsAwarded ?? 0
  )
}

describe('hostess desk API', () => {
  beforeEach(async () => {
    await prisma.event.deleteMany()
    await prisma.authSession.deleteMany()
    await prisma.user.deleteMany()
    await seedEvent(prisma)
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  test('hostesses and administrators reach the desk, participants do not, and staff cannot play', async () => {
    const participant = await register()
    const hostess = await makeStaff('hostess')
    const admin = await makeStaff('admin')

    expect((await search(participant, 'ab')).status).toBe(403)
    expect((await search(hostess, 'ab')).status).toBe(200)
    expect((await search(admin, 'ab')).status).toBe(200)
    expect((await app.request('/api/hostess/participants?q=ab')).status).toBe(401)

    // A hostess is staff: she has no points, no progress and no scan of her own.
    expect((await api('GET', '/api/event/me', hostess.accessToken)).status).toBe(403)
    const station = await stationNamed('Воркшоп 1')
    expect((await scan(hostess, station.qrToken)).status).toBe(403)
    expect((await award(participant, participant.id, station.id)).status).toBe(403)
  })

  test('search matches every word, only participants, and shows their points', async () => {
    const hostess = await makeStaff('hostess')
    const anna = await register({ firstName: 'Анна', lastName: 'Петрова', company: 'Завод', city: 'Тюмень' })
    const oleg = await register({ firstName: 'Олег', lastName: 'Иванов', company: 'Офис', city: 'Омск' })
    await scan(anna, (await stationNamed('Воркшоп 1')).qrToken)

    const byName = await search(hostess, 'анна ПЕТРОВА')
    expect(await byName.json()).toEqual({
      participants: [
        {
          id: anna.id,
          fullName: 'Анна Петрова',
          company: 'Завод',
          city: 'Тюмень',
          email: expect.stringContaining('@example.com'),
          totalPoints: 1,
        },
      ],
    })

    const ids = async (q: string) =>
      ((await (await search(hostess, q)).json()) as { participants: { id: string }[] }).participants.map(
        (person) => person.id,
      )
    expect(await ids('Иванов')).toEqual([oleg.id])
    expect(await ids('тюмень')).toEqual([anna.id])
    expect(await ids('Анна Иванов')).toEqual([]) // one word per person is not enough
    expect(await ids('Хостес')).toEqual([]) // staff are never listed

    const tooShort = await search(hostess, 'a')
    expect(tooShort.status).toBe(400)
  })

  test('a scanned participant QR resolves to the participant and their stations', async () => {
    const hostess = await makeStaff('hostess')
    const anna = await register({ firstName: 'Анна', lastName: 'Петрова' })
    const workshop = await stationNamed('Воркшоп 1')
    await scan(anna, workshop.qrToken)

    const resolved = await api('POST', '/api/hostess/participants/resolve', hostess.accessToken, {
      token: anna.qr,
    })
    expect(resolved.status).toBe(200)
    const body = (await resolved.json()) as {
      participant: { id: string; totalPoints: number }
      stations: { id: string; visited: boolean }[]
    }
    expect(body.participant).toMatchObject({ id: anna.id, totalPoints: 1 })
    expect(body.stations).toHaveLength(15)
    expect(body.stations.find((station) => station.id === workshop.id)?.visited).toBe(true)
    expect(body.stations.filter((station) => station.visited)).toHaveLength(1)

    const unknown = await api('POST', '/api/hostess/participants/resolve', hostess.accessToken, {
      token: 'not-a-real-token',
    })
    expect(unknown.status).toBe(404)
    expect(await errorCode(unknown)).toBe('DIFFUSION_INVALID_PARTICIPANT_TOKEN')

    // The QR of a staff account is not a participant's.
    const hostessQr = (await prisma.user.findUniqueOrThrow({ where: { id: hostess.id } })).personalQrToken
    const staffQr = await api('POST', '/api/hostess/participants/resolve', hostess.accessToken, {
      token: hostessQr,
    })
    expect(staffQr.status).toBe(404)
  })

  test('the participant page answers by id, and refuses unknown ids and staff', async () => {
    const hostess = await makeStaff('hostess')
    const anna = await register()

    const found = await api('GET', `/api/hostess/participants/${anna.id}`, hostess.accessToken)
    expect(found.status).toBe(200)
    expect(((await found.json()) as { participant: { id: string } }).participant.id).toBe(anna.id)

    expect((await api('GET', '/api/hostess/participants/not-a-uuid', hostess.accessToken)).status).toBe(400)
    const missing = await api('GET', `/api/hostess/participants/${crypto.randomUUID()}`, hostess.accessToken)
    expect(missing.status).toBe(404)
    expect((await api('GET', `/api/hostess/participants/${hostess.id}`, hostess.accessToken)).status).toBe(404)
  })

  test('an award scores like the participant own scan, once, and remembers who did it', async () => {
    const hostess = await makeStaff('hostess')
    const anna = await register()
    const workshop = await stationNamed('Воркшоп 1')

    const first = await award(hostess, anna.id, workshop.id)
    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({ pointsAwarded: 1, totalPoints: 1, alreadyCompleted: false })

    const row = await prisma.activityLog.findFirstOrThrow({ where: { participantId: anna.id } })
    expect(row).toMatchObject({ actionType: 'station_scan', refId: workshop.id, awardedById: hostess.id })
    expect(await prisma.stationVisit.count({ where: { participantId: anna.id } })).toBe(1)

    const repeat = await award(hostess, anna.id, workshop.id)
    expect(await repeat.json()).toEqual({ pointsAwarded: 0, totalPoints: 1, alreadyCompleted: true })
    // The participant finding the same QR later does not score twice either.
    const own = await scan(anna, workshop.qrToken)
    expect(await own.json()).toMatchObject({ pointsAwarded: 0, alreadyCompleted: true })
    expect(await prisma.activityLog.count({ where: { participantId: anna.id } })).toBe(1)

    // And the other way round: her own scan first, the hostess adds nothing.
    const second = await stationNamed('Воркшоп 2')
    await scan(anna, second.qrToken)
    const late = await award(hostess, anna.id, second.id)
    expect(await late.json()).toMatchObject({ pointsAwarded: 0, alreadyCompleted: true })
    const own2 = await prisma.activityLog.findFirstOrThrow({
      where: { participantId: anna.id, refId: second.id },
    })
    expect(own2.awardedById).toBeNull()
  })

  test('the Polymer game scores once, whichever placement is awarded or scanned', async () => {
    const hostess = await makeStaff('hostess')
    const anna = await register()
    const first = await polymerPlace(10)
    const third = await polymerPlace(8)

    const awarded = await award(hostess, anna.id, first.id)
    expect(await awarded.json()).toEqual({ pointsAwarded: 10, totalPoints: 10, alreadyCompleted: false })
    expect(await (await award(hostess, anna.id, third.id)).json()).toMatchObject({
      pointsAwarded: 0,
      alreadyCompleted: true,
    })
    expect(await (await scan(anna, third.qrToken)).json()).toMatchObject({
      pointsAwarded: 0,
      alreadyCompleted: true,
    })
    expect(await totalPoints(anna.id)).toBe(10)
    expect(await prisma.activityLog.count({ where: { participantId: anna.id, actionType: 'polymer' } })).toBe(1)
  })

  test('an award is refused for a closed event, an inactive station and unknown ids', async () => {
    const hostess = await makeStaff('hostess')
    const anna = await register()
    const workshop = await stationNamed('Воркшоп 1')

    await prisma.station.update({ where: { id: workshop.id }, data: { isActive: false } })
    const inactive = await award(hostess, anna.id, workshop.id)
    expect(inactive.status).toBe(409)
    expect(await errorCode(inactive)).toBe('EVENT_STATION_INACTIVE')
    await prisma.station.update({ where: { id: workshop.id }, data: { isActive: true } })

    await prisma.event.updateMany({ data: { isActive: false } })
    const closed = await award(hostess, anna.id, workshop.id)
    expect(closed.status).toBe(409)
    expect(await errorCode(closed)).toBe('EVENT_NOT_ACTIVE')
    await prisma.event.updateMany({ data: { isActive: true } })

    expect((await award(hostess, crypto.randomUUID(), workshop.id)).status).toBe(404)
    expect((await award(hostess, anna.id, crypto.randomUUID())).status).toBe(404)
    // A hostess cannot award herself: staff are not participants.
    expect((await award(hostess, hostess.id, workshop.id)).status).toBe(404)
    expect((await award(hostess, 'not-a-uuid', workshop.id)).status).toBe(400)
    expect(await totalPoints(anna.id)).toBe(0)
  })

  test('hostesses stay out of the leaderboard', async () => {
    const hostess = await makeStaff('hostess')
    const anna = await register({ firstName: 'Анна', lastName: 'Петрова' })
    await award(hostess, anna.id, (await stationNamed('Воркшоп 1')).id)

    const board = (await (await api('GET', '/api/event/leaderboard', anna.accessToken)).json()) as {
      entries: { fullName: string }[]
    }
    expect(board.entries.map((entry) => entry.fullName)).toEqual(['Анна Петрова'])
  })

  test('an administrator can make a hostess, but cannot demote themselves', async () => {
    const admin = await makeStaff('admin')
    const anna = await register()
    const setRole = (id: string, role: string) =>
      api('PATCH', `/api/admin/users/${id}/role`, admin.accessToken, { role })

    const promoted = await setRole(anna.id, 'hostess')
    expect(promoted.status).toBe(200)
    expect(((await promoted.json()) as { user: { role: string } }).user.role).toBe('hostess')
    // A role change ends every session, so the new hostess signs in again.
    expect(await prisma.authSession.count({ where: { userId: anna.id, revokedAt: null } })).toBe(0)

    expect((await setRole(admin.id, 'hostess')).status).toBe(409)
    const second = await makeStaff('admin')
    expect((await setRole(second.id, 'hostess')).status).toBe(200)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: second.id } })).role).toBe('hostess')
  })
})
