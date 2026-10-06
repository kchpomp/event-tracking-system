import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { createApp } from '../../app'
import { acquireParticipantScoringLock, createPrisma } from '../../db'
import { loadEnv } from '../../env'
import { seedEvent } from './infrastructure/event-seed'

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required; run bun run test:backend:integration')

const env = loadEnv({
  DATABASE_URL: databaseUrl,
  JWT_SECRET: '12345678901234567890123456789012',
  CORS_ORIGINS: 'http://localhost:5173',
  ACCESS_TOKEN_TTL_SECONDS: '600',
  // This suite makes hundreds of requests from one in-process client.
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
      consent: true,
      ...overrides,
    }),
  })
  expect(response.status).toBe(201)
  const body = (await response.json()) as { accessToken: string; user: { id: string } }
  const me = await api('GET', '/api/event/me', body.accessToken)
  return {
    accessToken: body.accessToken,
    id: body.user.id,
    qr: ((await me.json()) as { profile: { personalQrToken: string } }).profile.personalQrToken,
  }
}

function api(method: string, path: string, accessToken: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const scan = (person: Person, token: string) => api('POST', '/api/event/scan', person.accessToken, { token })
const connect = (person: Person, token: string) =>
  api('POST', '/api/event/diffusion/connections', person.accessToken, { token })

async function progress(person: Person) {
  const me = await api('GET', '/api/event/me', person.accessToken)
  return ((await me.json()) as { progress: { totalPoints: number; ideasCount: number; connectionsCount: number } })
    .progress
}

async function stationToken(name: string, points?: number) {
  const station = await prisma.station.findFirstOrThrow({
    where: { name, ...(points === undefined ? {} : { points }) },
  })
  return station.qrToken
}

async function errorCode(response: Response) {
  return ((await response.json()) as { error: { code: string } }).error.code
}

async function makeAdmin() {
  const admin = await register()
  await prisma.user.update({ where: { id: admin.id }, data: { role: 'admin' } })
  return admin
}

describe('event participation API', () => {
  beforeEach(async () => {
    await prisma.event.deleteMany() // stations and visits cascade
    await prisma.authSession.deleteMany()
    await prisma.user.deleteMany() // ledger, ideas and connections cascade
    await seedEvent(prisma)
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  test('registration stores the profile and the consent, and rejects a sign-up without consent', async () => {
    const person = await register({ firstName: 'Анна', lastName: 'Петрова', company: 'Завод', city: 'Тюмень' })
    const user = await prisma.user.findUniqueOrThrow({ where: { id: person.id } })
    expect(user).toMatchObject({ firstName: 'Анна', lastName: 'Петрова', company: 'Завод', city: 'Тюмень' })
    expect(user.consentedAt).toBeInstanceOf(Date)
    expect(person.qr.length).toBeGreaterThan(20)

    for (const consent of [false, undefined]) {
      const response = await app.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
        body: JSON.stringify({
          email: 'noconsent@example.com',
          password: 'password-1234',
          firstName: 'А',
          lastName: 'Б',
          company: 'В',
          city: 'Г',
          consent,
        }),
      })
      expect(response.status).toBe(400)
    }
    expect(await prisma.user.count({ where: { email: 'noconsent@example.com' } })).toBe(0)
    expect(await progress(person)).toEqual({ totalPoints: 0, ideasCount: 0, connectionsCount: 0 })
  })

  test('a station scores once; a repeat scan changes nothing', async () => {
    const person = await register()
    const token = await stationToken('Воркшоп 1')

    const first = await scan(person, token)
    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({
      pointsAwarded: 1,
      totalPoints: 1,
      alreadyCompleted: false,
      successMessage: null,
    })

    const again = await scan(person, token)
    expect(await again.json()).toMatchObject({ pointsAwarded: 0, totalPoints: 1, alreadyCompleted: true })
    expect(await prisma.activityLog.count({ where: { participantId: person.id } })).toBe(1)

    const stations = (await (await api('GET', '/api/event/stations', person.accessToken)).json()) as {
      stations: { name: string; visited: boolean }[]
    }
    expect(stations.stations.find((station) => station.name === 'Воркшоп 1')?.visited).toBe(true)
    expect(stations.stations.find((station) => station.name === 'Воркшоп 2')?.visited).toBe(false)
  })

  test('a station message is returned, and unknown, inactive and closed scans are refused', async () => {
    const person = await register()
    const people = await scan(person, await stationToken('Люди формулы будущего'))
    expect((await people.json()) as { successMessage: string }).toMatchObject({
      successMessage: 'Спасибо! Вы стали частью «Людей Формулы будущего».',
    })

    const unknown = await scan(person, 'not-a-real-token')
    expect(unknown.status).toBe(404)
    expect(await errorCode(unknown)).toBe('EVENT_INVALID_STATION_TOKEN')

    await prisma.station.updateMany({ where: { name: 'Воркшоп 2' }, data: { isActive: false } })
    const inactive = await scan(person, await stationToken('Воркшоп 2'))
    expect(inactive.status).toBe(409)
    expect(await errorCode(inactive)).toBe('EVENT_STATION_INACTIVE')

    await prisma.event.updateMany({ data: { isActive: false } })
    const closed = await scan(person, await stationToken('Воркшоп 3'))
    expect(closed.status).toBe(409)
    expect(await errorCode(closed)).toBe('EVENT_NOT_ACTIVE')
    expect(await progress(person)).toMatchObject({ totalPoints: 1 })
  })

  test('scoring waits for the participant lock, so concurrent requests are counted one after the other', async () => {
    // One client runs its transactions almost back to back, so a real race cannot be provoked
    // from here. This proves the lock itself instead: while another transaction holds the
    // participant's lock, a scan, an idea and a connection must all still be waiting.
    const person = await register({ city: 'Тюмень', company: 'Завод' })
    const other = await register({ city: 'Омск', company: 'Завод' })
    const pending: Promise<unknown>[] = []
    let finished = 0
    const track = (request: Response | Promise<Response>) => {
      pending.push(Promise.resolve(request).then(() => (finished += 1)))
    }

    await prisma.$transaction(async (tx) => {
      await acquireParticipantScoringLock(tx, person.id)
      await acquireParticipantScoringLock(tx, other.id)
      track(scan(person, await stationToken('Воркшоп 1')))
      track(
        api('POST', '/api/event/ideas', person.accessToken, {
          title: 'Идея',
          direction: 'Направление',
          problem: 'Проблема',
          description: 'Описание',
          expectedResult: 'Эффект',
        }),
      )
      track(connect(person, other.qr))
      await Bun.sleep(500)
      expect(finished).toBe(0)
    })

    await Promise.all(pending)
    expect(finished).toBe(3)
    expect(await progress(person)).toMatchObject({ totalPoints: 3, ideasCount: 1, connectionsCount: 1 })
  })

  test('the Polymer game awards once per person whichever of its QR codes is scanned', async () => {
    const person = await register()
    const first = await scan(person, await stationToken('Полимер решений', 10))
    expect(await first.json()).toMatchObject({ pointsAwarded: 10, totalPoints: 10, alreadyCompleted: false })
    const second = await scan(person, await stationToken('Полимер решений', 5))
    expect(await second.json()).toMatchObject({ pointsAwarded: 0, totalPoints: 10, alreadyCompleted: true })

    expect(await prisma.activityLog.count({ where: { participantId: person.id, actionType: "polymer" } })).toBe(1)
  })

  test('a connection is one row for both people, scores once each, and the first three score', async () => {
    const a = await register({ city: 'Тюмень', company: 'Завод' })
    const b = await register({ city: 'Омск', company: 'Завод' })

    const made = await connect(a, b.qr)
    expect(made.status).toBe(200)
    expect(await made.json()).toEqual({ connectionsCount: 1, alreadyConnected: false })
    expect(await progress(a)).toMatchObject({ totalPoints: 1, connectionsCount: 1 })
    expect(await progress(b)).toMatchObject({ totalPoints: 1, connectionsCount: 1 })

    // B scanning A (the other direction) and A scanning B again are repeats.
    expect(await (await connect(b, a.qr)).json()).toEqual({ connectionsCount: 1, alreadyConnected: true })
    expect(await (await connect(a, b.qr)).json()).toEqual({ connectionsCount: 1, alreadyConnected: true })
    expect(await prisma.connection.count()).toBe(1)
    expect((await progress(a)).totalPoints).toBe(1)

    // Both scanning each other at once is still one row.
    const c = await register({ city: 'Казань' })
    const d = await register({ city: 'Самара' })
    await Promise.all([connect(c, d.qr), connect(d, c.qr)])
    expect(await prisma.connection.count()).toBe(2)
    expect((await progress(c)).totalPoints).toBe(1)

    // Only the first three connections score; the count keeps growing.
    for (const city of ['Уфа', 'Пермь', 'Томск']) {
      const other = await register({ city })
      await connect(a, other.qr)
    }
    expect(await progress(a)).toMatchObject({ connectionsCount: 4, totalPoints: 3 })
  })

  test('self, same city and company, and unknown participant codes are refused with their own codes', async () => {
    const a = await register({ city: 'Тюмень', company: 'Завод' })
    const sameWorkplace = await register({ city: ' тюмень ', company: 'ЗАВОД' })
    const sameCityOnly = await register({ city: 'Тюмень', company: 'Офис' })

    const self = await connect(a, a.qr)
    expect(self.status).toBe(409)
    expect(await errorCode(self)).toBe('DIFFUSION_SELF')

    const same = await connect(a, sameWorkplace.qr)
    expect(same.status).toBe(409)
    expect(await errorCode(same)).toBe('DIFFUSION_SAME_CITY_AND_COMPANY')

    expect((await connect(a, sameCityOnly.qr)).status).toBe(200)

    const unknown = await connect(a, 'nobody')
    expect(unknown.status).toBe(404)
    expect(await errorCode(unknown)).toBe('DIFFUSION_INVALID_PARTICIPANT_TOKEN')
  })

  test('the first five ideas score one point each; later ones are accepted without points', async () => {
    const person = await register()
    const idea = (n: number) => ({
      title: `Идея ${n}`,
      direction: 'Цифровизация',
      problem: 'Проблема',
      description: 'Описание',
      expectedResult: 'Эффект',
    })
    for (let n = 1; n <= 6; n += 1) {
      const response = await api('POST', '/api/event/ideas', person.accessToken, idea(n))
      expect(response.status).toBe(201)
      expect(await response.json()).toEqual({ ideasCount: n })
    }
    expect(await progress(person)).toMatchObject({ ideasCount: 6, totalPoints: 5 })

    const blank = await api('POST', '/api/event/ideas', person.accessToken, { ...idea(7), title: '   ' })
    expect(blank.status).toBe(400)
  })

  test('the leaderboard lists the top 10 plus the caller, ties share a rank, and administrators never appear', async () => {
    const admin = await makeAdmin()
    const people: Person[] = []
    for (let n = 0; n < 12; n += 1) people.push(await register())
    // Two ties (5, 5 and 4, 4 ...) and three people on 1: ranks must skip, not count rows.
    const pointsByIndex = [5, 5, 4, 4, 3, 3, 2, 2, 1, 1, 1, 0]
    for (const [index, points] of pointsByIndex.entries()) {
      for (let k = 0; k < points; k += 1) {
        await prisma.activityLog.create({
          data: {
            participantId: people[index]!.id,
            actionType: 'station_scan',
            pointsAwarded: 1,
            refId: crypto.randomUUID(),
          },
        })
      }
    }

    const asTop = (await (await api('GET', '/api/event/leaderboard', people[0]!.accessToken)).json()) as {
      entries: { rank: number; fullName: string; totalPoints: number; isMe: boolean }[]
    }
    expect(asTop.entries).toHaveLength(10)
    expect(asTop.entries.slice(0, 2).map((entry) => [entry.rank, entry.totalPoints])).toEqual([
      [1, 5],
      [1, 5],
    ])
    expect(asTop.entries[2]!.rank).toBe(3)
    expect(asTop.entries.filter((entry) => entry.isMe)).toHaveLength(1)

    // The last person is outside the top 10: their own row comes last, with their real rank.
    const asLast = (await (await api('GET', '/api/event/leaderboard', people[11]!.accessToken)).json()) as {
      entries: { rank: number; isMe: boolean; totalPoints: number }[]
    }
    expect(asLast.entries).toHaveLength(11)
    expect(asLast.entries.at(-1)).toMatchObject({ isMe: true, totalPoints: 0, rank: 12 })

    // Administrators are not participants: no listing for them, and they never appear in it.
    expect((await api('GET', '/api/event/leaderboard', admin.accessToken)).status).toBe(403)
    expect(await prisma.user.count()).toBe(13)
    const adminName = (await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).displayName
    const everyone = (await (await api('GET', '/api/event/leaderboard', people[11]!.accessToken)).json()) as {
      entries: { fullName: string }[]
    }
    expect(everyone.entries.map((entry) => entry.fullName)).not.toContain(adminName)
  })

  test('station tokens reach only administrators', async () => {
    const person = await register()
    const admin = await makeAdmin()
    const tokens = (await prisma.station.findMany({ select: { qrToken: true } })).map((s) => s.qrToken)

    const stationsBody = await (await api('GET', '/api/event/stations', person.accessToken)).text()
    const meBody = await (await api('GET', '/api/event/me', person.accessToken)).text()
    for (const token of tokens) {
      expect(stationsBody).not.toContain(token)
      expect(meBody).not.toContain(token)
    }

    expect((await api('GET', '/api/admin/stations', person.accessToken)).status).toBe(403)
    const adminView = await api('GET', '/api/admin/stations', admin.accessToken)
    expect(adminView.status).toBe(200)
    const body = (await adminView.json()) as {
      event: { isActive: boolean }
      stations: { qrToken: string }[]
    }
    expect(body.event.isActive).toBe(true)
    expect(body.stations.map((station) => station.qrToken).sort()).toEqual([...tokens].sort())

    // Participant routes are closed to administrators.
    expect((await api('GET', '/api/event/me', admin.accessToken)).status).toBe(403)
  })

  test('an administrator can close and reopen the event, and a closed event refuses scans', async () => {
    const person = await register()
    const admin = await makeAdmin()
    const token = await stationToken('Воркшоп 1')

    const close = await api('PATCH', '/api/admin/event', admin.accessToken, { isActive: false })
    expect(close.status).toBe(200)
    expect(await errorCode(await scan(person, token))).toBe('EVENT_NOT_ACTIVE')

    await api('PATCH', '/api/admin/event', admin.accessToken, { isActive: true })
    expect((await scan(person, token)).status).toBe(200)
    expect((await api('PATCH', '/api/admin/event', person.accessToken, { isActive: false })).status).toBe(403)
  })

  test('seeding twice keeps the first event and its QR tokens', async () => {
    const before = (await prisma.station.findMany({ select: { qrToken: true } })).map((s) => s.qrToken).sort()
    expect(before).toHaveLength(15)
    expect(await seedEvent(prisma)).toEqual({ created: false })
    const after = (await prisma.station.findMany({ select: { qrToken: true } })).map((s) => s.qrToken).sort()
    expect(after).toEqual(before)
  })
})
