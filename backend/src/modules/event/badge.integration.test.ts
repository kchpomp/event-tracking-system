import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { createApp } from '../../app'
import { createPrisma } from '../../db'
import { loadEnv } from '../../env'
import { seedEvent } from './infrastructure/event-seed'
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
      companyId: COMPANY_IDS[counter % 10],
      cityId: CITY_IDS[counter % 10],
      consent: true,
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

const issue = (staff: Person, participantId: string) =>
  api('POST', `/api/hostess/participants/${participantId}/badge`, staff.accessToken)
const hostessBadge = (staff: Person, participantId: string) =>
  api('GET', `/api/hostess/participants/${participantId}/badge`, staff.accessToken)
const myBadge = (person: Person) => api('GET', '/api/event/badge', person.accessToken)
const scan = (person: Person, token: string) =>
  api('POST', '/api/event/scan', person.accessToken, { token })
const stationNamed = (name: string) => prisma.station.findFirstOrThrow({ where: { name } })
const badgeRows = (participantId: string) =>
  prisma.activityLog.count({ where: { participantId, actionType: 'badge' } })

async function errorCode(response: Response) {
  return ((await response.json()) as { error: { code: string } }).error.code
}

/** Two stations and one idea: three activities. */
async function completeThree(person: Person, idea = true) {
  await scan(person, (await stationNamed('Воркшоп 1')).qrToken)
  await scan(person, (await stationNamed('Воркшоп 2')).qrToken)
  if (idea) {
    await api('POST', '/api/event/ideas', person.accessToken, {
      title: 'Идея',
      direction: 'Направление',
      problem: 'Проблема',
      description: 'Описание',
      expectedResult: 'Эффект',
    })
  }
}

describe('badge «Значок»', () => {
  beforeEach(async () => {
    await prisma.event.deleteMany()
    await prisma.authSession.deleteMany()
    await prisma.user.deleteMany()
    await seedEvent(prisma)
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  test('two activities are not enough: 409 with a Russian message, and no row', async () => {
    const hostess = await makeStaff('hostess')
    const anna = await register()
    await completeThree(anna, false)

    const status = await hostessBadge(hostess, anna.id)
    expect(status.status).toBe(200)
    expect(await status.json()).toMatchObject({
      participant: { id: anna.id },
      completed: 2,
      required: 3,
      eligible: false,
      issued: false,
      points: 0,
    })

    const refused = await issue(hostess, anna.id)
    expect(refused.status).toBe(409)
    expect(await refused.json()).toMatchObject({ error: { message: 'Не хватает активностей: пройдено 2 из 3' } })
    expect(await badgeRows(anna.id)).toBe(0)
  })

  test('an eligible person gets the badge once: one row, one point, then 409', async () => {
    const hostess = await makeStaff('hostess')
    const anna = await register()
    await completeThree(anna)
    const before = (await prisma.activityLog.aggregate({ where: { participantId: anna.id }, _sum: { pointsAwarded: true } }))._sum.pointsAwarded ?? 0

    const created = await issue(hostess, anna.id)
    expect(created.status).toBe(201)
    expect(await created.json()).toMatchObject({ completed: 3, required: 3, eligible: true, issued: true, points: 1 })
    const event = await prisma.event.findFirstOrThrow()
    expect(await prisma.activityLog.findFirstOrThrow({ where: { participantId: anna.id, actionType: 'badge' } })).toMatchObject({
      pointsAwarded: 1,
      refId: event.id,
      awardedById: hostess.id,
    })
    const board = (await (await api('GET', '/api/event/leaderboard', anna.accessToken)).json()) as {
      entries: { totalPoints: number; isMe: boolean }[]
    }
    expect(board.entries.find((entry) => entry.isMe)?.totalPoints).toBe(before + 1)

    const again = await issue(hostess, anna.id)
    expect(again.status).toBe(409)
    expect(await again.json()).toMatchObject({ error: { message: 'Значок уже выдан' } })
    expect(await badgeRows(anna.id)).toBe(1)

    // The badge itself is no activity.
    expect(await (await hostessBadge(hostess, anna.id)).json()).toMatchObject({ completed: 3, issued: true, points: 1 })
  })

  test('two requests at once give one row', async () => {
    const hostess = await makeStaff('hostess')
    const admin = await makeStaff('admin')
    const anna = await register()
    await completeThree(anna)

    const statuses = (await Promise.all([issue(hostess, anna.id), issue(admin, anna.id)])).map((r) => r.status)
    expect(statuses.sort()).toEqual([201, 409])
    expect(await badgeRows(anna.id)).toBe(1)
  })

  test('the Polymer game is one activity, a station once, connections and ideas once each', async () => {
    const hostess = await makeStaff('hostess')
    const anna = await register()
    const other = await register()
    const polymerA = await prisma.station.findFirstOrThrow({ where: { displayGroup: 'polymer_solutions', points: 10 } })
    const polymerB = await prisma.station.findFirstOrThrow({ where: { displayGroup: 'polymer_solutions', points: 8 } })
    await scan(anna, polymerA.qrToken)
    await scan(anna, polymerB.qrToken)
    await scan(anna, (await stationNamed('Воркшоп 1')).qrToken)
    expect((await issue(hostess, anna.id)).status).toBe(409)

    await api('POST', '/api/event/diffusion/connections', anna.accessToken, { token: other.qr })
    const mine = (await (await myBadge(anna)).json()) as { completed: number; activities: { name: string }[] }
    expect(mine.completed).toBe(3)
    expect(mine.activities.map((a) => a.name).sort()).toEqual(['Воркшоп 1', 'Диффузия', 'Полимер решений'].sort())
    expect((await issue(hostess, anna.id)).status).toBe(201)
  })

  test('only staff reach the hostess routes; unknown ids and staff targets are 404; a closed event refuses', async () => {
    const hostess = await makeStaff('hostess')
    const anna = await register()
    await completeThree(anna)

    expect((await issue(anna, anna.id)).status).toBe(403)
    expect((await hostessBadge(anna, anna.id)).status).toBe(403)
    expect((await issue(hostess, crypto.randomUUID())).status).toBe(404)
    expect((await hostessBadge(hostess, crypto.randomUUID())).status).toBe(404)
    expect((await issue(hostess, hostess.id)).status).toBe(404)
    expect((await hostessBadge(hostess, hostess.id)).status).toBe(404)
    expect((await app.request(`/api/hostess/participants/${anna.id}/badge`)).status).toBe(401)
    expect((await myBadge(hostess)).status).toBe(403)

    await prisma.event.updateMany({ data: { isActive: false } })
    const closed = await issue(hostess, anna.id)
    expect(closed.status).toBe(409)
    expect(await errorCode(closed)).toBe('EVENT_NOT_ACTIVE')
    expect(await badgeRows(anna.id)).toBe(0)
  })

  test('the participant sees their progress and, after the hostess issues it, the badge', async () => {
    const hostess = await makeStaff('hostess')
    const anna = await register()
    await completeThree(anna)

    expect(await (await myBadge(anna)).json()).toEqual({
      completed: 3,
      required: 3,
      eligible: true,
      issued: false,
      points: 0,
      activities: expect.any(Array),
    })
    await issue(hostess, anna.id)
    expect(await (await myBadge(anna)).json()).toMatchObject({ completed: 3, eligible: true, issued: true, points: 1 })
  })
})
