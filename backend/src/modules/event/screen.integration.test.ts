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

type Person = { accessToken: string; id: string }
type Live = { override: boolean; teamId: string | null }

let counter = 0
async function register(role: 'user' | 'admin' | 'screen' = 'user'): Promise<Person> {
  counter += 1
  const response = await app.request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: JSON.stringify({
      email: `screen${counter}-${crypto.randomUUID()}@example.com`,
      password: 'password-1234',
      firstName: `Имя${counter}`,
      lastName: `Фамилия${counter}`,
      companyId: COMPANY_IDS[0],
      cityId: CITY_IDS[0],
      consent: true,
    }),
  })
  expect(response.status).toBe(201)
  const body = (await response.json()) as { accessToken: string; user: { id: string } }
  await prisma.user.update({ where: { id: body.user.id }, data: { role } })
  return { accessToken: body.accessToken, id: body.user.id }
}

const api = (method: string, path: string, who: Person, body?: unknown) =>
  app.request(path, {
    method,
    headers: { Authorization: `Bearer ${who.accessToken}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

const setLive = (who: Person, body: unknown) => api('PUT', '/api/admin/schedule/live', who, body)
const scheduleLive = async (who: Person) =>
  ((await (await api('GET', '/api/event/schedule', who)).json()) as { live: Live }).live

describe('live team override and screen role', () => {
  beforeEach(async () => {
    await prisma.plannedParticipant.deleteMany()
    await prisma.authSession.deleteMany()
    await prisma.user.deleteMany()
    await prisma.team.deleteMany()
    await prisma.event.deleteMany()
    await prisma.event.create({ data: {} })
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  test('the live team is automatic by default, and the admin sets a team, nobody, or auto', async () => {
    const admin = await register('admin')
    const participant = await register()
    const team = await prisma.team.create({ data: { name: 'Альфа' } })
    expect(await scheduleLive(participant)).toEqual({ override: false, teamId: null })

    const set = await setLive(admin, { mode: 'team', teamId: team.id })
    expect(set.status).toBe(200)
    expect(await set.json()).toEqual({ override: true, teamId: team.id })
    expect(await scheduleLive(participant)).toEqual({ override: true, teamId: team.id })

    expect(await (await setLive(admin, { mode: 'none' })).json()).toEqual({ override: true, teamId: null })
    expect(await scheduleLive(participant)).toEqual({ override: true, teamId: null })

    expect(await (await setLive(admin, { mode: 'auto' })).json()).toEqual({ override: false, teamId: null })
    expect(await scheduleLive(participant)).toEqual({ override: false, teamId: null })
  })

  test('only an administrator sets it; an unknown team is 404; deleting the live team leaves nobody', async () => {
    const admin = await register('admin')
    const participant = await register()
    const team = await prisma.team.create({ data: { name: 'Альфа' } })

    expect((await setLive(participant, { mode: 'none' })).status).toBe(403)
    expect((await setLive(admin, { mode: 'team', teamId: crypto.randomUUID() })).status).toBe(404)
    expect((await setLive(admin, { mode: 'team' })).status).toBe(400)

    await setLive(admin, { mode: 'team', teamId: team.id })
    await prisma.team.delete({ where: { id: team.id } })
    expect(await scheduleLive(participant)).toEqual({ override: true, teamId: null })
  })

  test('a screen reads the network and nothing else', async () => {
    const screen = await register('screen')
    const admin = await register('admin')
    const participant = await register()
    const team = await prisma.team.create({ data: { name: 'Альфа' } })

    expect((await api('GET', '/api/admin/network', screen)).status).toBe(200)
    expect((await api('GET', '/api/admin/network', admin)).status).toBe(200)
    expect((await api('GET', '/api/admin/network', participant)).status).toBe(403)

    for (const [method, path, body] of [
      ['GET', '/api/admin/users'],
      ['GET', '/api/admin/teams'],
      ['GET', '/api/admin/stations'],
      ['GET', '/api/event/me'],
      ['GET', '/api/event/leaderboard'],
      ['POST', '/api/event/scan', { token: 'x'.repeat(32) }],
      ['PUT', `/api/admin/teams/${team.id}/schedule`, { startsAt: null, endsAt: null }],
      ['PUT', '/api/admin/schedule/live', { mode: 'none' }],
      ['GET', '/api/hostess/teams'],
    ] as const) {
      expect([method, path, (await api(method, path, screen, body)).status]).toEqual([method, path, 403])
    }
    // Sign-in endpoints every role has still work.
    expect((await api('GET', '/api/auth/me', screen)).status).toBe(200)
    expect((await api('GET', '/api/event/schedule', screen)).status).toBe(200)
  })

  test('a screen is no participant: not in the network, rating or team counts; the admin assigns it', async () => {
    const admin = await register('admin')
    const person = await register()
    const team = await prisma.team.create({ data: { name: 'Альфа' } })
    await prisma.user.update({ where: { id: person.id }, data: { teamId: team.id } })
    await prisma.activityLog.create({
      data: { participantId: person.id, actionType: 'idea', pointsAwarded: 3, refId: crypto.randomUUID() },
    })

    const assign = await api('PATCH', `/api/admin/users/${person.id}/role`, admin, { role: 'screen' })
    expect(assign.status).toBe(200)
    // Sessions end on a role change, and the points go with the participant role.
    expect((await api('GET', '/api/auth/me', person)).status).toBe(401)
    expect(await prisma.activityLog.count({ where: { participantId: person.id } })).toBe(0)

    const network = (await (await api('GET', '/api/admin/network', admin)).json()) as { nodes: unknown[] }
    expect(network.nodes).toEqual([])
    const teams = (await (await api('GET', '/api/admin/teams', admin)).json()) as {
      teams: { memberCount: number }[]
    }
    expect(teams.teams[0]!.memberCount).toBe(0)
  })

  test('sign-up cannot create a screen account', async () => {
    const response = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
      body: JSON.stringify({
        email: `x-${crypto.randomUUID()}@example.com`,
        password: 'password-1234',
        firstName: 'А',
        lastName: 'Б',
        companyId: COMPANY_IDS[0],
        cityId: CITY_IDS[0],
        consent: true,
        role: 'screen',
      }),
    })
    const body = (await response.json()) as { user?: { role: string } }
    expect(body.user?.role).not.toBe('screen')
  })
})
