import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { createApp } from '../../app'
import { acquireParticipantScoringLock, createPrisma } from '../../db'
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

let counter = 0
async function register(role: 'user' | 'hostess' | 'admin' = 'user', teamId?: string): Promise<Person> {
  counter += 1
  const response = await app.request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: JSON.stringify({
      email: `person${counter}-${crypto.randomUUID()}@example.com`,
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
  await prisma.user.update({ where: { id: body.user.id }, data: { role, teamId } })
  return { accessToken: body.accessToken, id: body.user.id }
}

const api = (method: string, path: string, who: Person, body?: unknown) =>
  app.request(path, {
    method,
    headers: { Authorization: `Bearer ${who.accessToken}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

const teamAward = (who: Person, body: Record<string, unknown>) =>
  api('POST', '/api/hostess/team-award', who, body)

describe('teams', () => {
  beforeEach(async () => {
    await prisma.plannedParticipant.deleteMany()
    await prisma.authSession.deleteMany()
    await prisma.user.deleteMany()
    await prisma.team.deleteMany()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  test('the profile names the team, or null without one', async () => {
    const team = await prisma.team.create({ data: { name: 'Альфа' } })
    const member = await register('user', team.id)
    const loner = await register()

    const mine = (await (await api('GET', '/api/event/me', member)).json()) as {
      profile: { team: { id: string; name: string } | null }
    }
    expect(mine.profile.team).toEqual({ id: team.id, name: 'Альфа' })
    const alone = (await (await api('GET', '/api/event/me', loner)).json()) as typeof mine
    expect(alone.profile.team).toBeNull()
  })

  test('my team lists its members with points and photo, best first', async () => {
    const team = await prisma.team.create({ data: { name: 'Альфа' } })
    await prisma.team.create({ data: { name: 'Бета' } })
    const [first, second] = [await register('user', team.id), await register('user', team.id)]
    const outsider = await register()
    await prisma.activityLog.create({
      data: { participantId: second.id, actionType: 'idea', pointsAwarded: 3, refId: crypto.randomUUID() },
    })

    const response = await api('GET', '/api/event/team/members', first)
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      team: { name: string }
      members: { id: string; totalPoints: number; isMe: boolean; photo: unknown; firstName: string | null }[]
    }
    expect(body.team.name).toBe('Альфа')
    expect(body.members.map((m) => [m.id, m.totalPoints, m.isMe])).toEqual([
      [second.id, 3, false],
      [first.id, 0, true],
    ])
    expect(body.members[0]!.photo).toBeNull()
    expect(body.members[0]!.firstName).toStartWith('Имя')

    // Nobody outside a team sees a roster.
    const none = (await (await api('GET', '/api/event/team/members', outsider)).json()) as unknown
    expect(none).toEqual({ team: null, members: [] })

    expect((await api('GET', '/api/event/teams', outsider)).status).toBe(404)
  })

  test('a member gets the listed photo when the guest-list name matches the account', async () => {
    const team = await prisma.team.create({ data: { name: 'Альфа' } })
    const member = await register('user', team.id)
    const row = await prisma.user.findUniqueOrThrow({ where: { id: member.id } })
    await prisma.plannedParticipant.create({
      data: {
        email: row.email,
        firstName: row.firstName,
        lastName: row.lastName,
        department: 'СИБУР',
        city: 'Москва',
        photoObjectKey: 'planned-photos/2026/10/test',
        photoContentType: 'image/png',
        photoByteSize: 100,
      },
    })
    const body = (await (await api('GET', '/api/event/team/members', member)).json()) as {
      members: { photo: { url: string } | null }[]
    }
    expect(body.members[0]!.photo?.url).toBeString()
  })

  test('a team award writes one ledger row per member and none on a retry', async () => {
    const team = await prisma.team.create({ data: { name: 'Альфа' } })
    const members = [await register('user', team.id), await register('user', team.id), await register('user', team.id)]
    const outsider = await register()
    const hostess = await register('hostess')
    const awardKey = crypto.randomUUID()

    const first = await teamAward(hostess, { teamId: team.id, points: 7, awardKey })
    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({ teamId: team.id, points: 7, memberCount: 3, awarded: 3 })

    const rows = await prisma.activityLog.findMany({ where: { actionType: 'team_bonus' } })
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => r.pointsAwarded === 7 && r.refId === awardKey && r.awardedById === hostess.id)).toBe(true)
    expect(new Set(rows.map((r) => r.participantId))).toEqual(new Set(members.map((m) => m.id)))
    expect(await prisma.activityLog.count({ where: { participantId: outsider.id } })).toBe(0)

    // The same key again, even asking for other points, awards nothing.
    const retry = await teamAward(hostess, { teamId: team.id, points: 7, awardKey })
    expect(await retry.json()).toEqual({ teamId: team.id, points: 7, memberCount: 3, awarded: 0 })
    const other = await teamAward(hostess, { teamId: team.id, points: 9, awardKey })
    expect(((await other.json()) as { awarded: number }).awarded).toBe(0)
    expect(await prisma.activityLog.count({ where: { actionType: 'team_bonus' } })).toBe(3)

    // A new key is a new award; a member who joined meanwhile gets only that one.
    const late = await register('user', team.id)
    const second = await teamAward(hostess, { teamId: team.id, points: 2, awardKey: crypto.randomUUID() })
    expect(((await second.json()) as { awarded: number }).awarded).toBe(4)
    expect(await prisma.activityLog.count({ where: { participantId: late.id } })).toBe(1)

    // Admins may award too, and the points reach the member's total.
    const admin = await register('admin')
    expect((await teamAward(admin, { teamId: team.id, points: 1, awardKey: crypto.randomUUID() })).status).toBe(200)
    const me = (await (await api('GET', '/api/event/me', members[0]!)).json()) as {
      progress: { totalPoints: number }
    }
    expect(me.progress.totalPoints).toBe(7 + 2 + 1)

    // The hostess desk can list teams.
    const listed = (await (await api('GET', '/api/hostess/teams', hostess)).json()) as { teams: { memberCount: number }[] }
    expect(listed.teams[0]!.memberCount).toBe(4)
  })

  test('team bonus is capped at 100 points per participant over all award keys', async () => {
    const team = await prisma.team.create({ data: { name: 'Альфа' } })
    const member = await register('user', team.id)
    const hostess = await register('hostess')
    for (let i = 0; i < 2; i++) {
      const ok = await teamAward(hostess, { teamId: team.id, points: 50, awardKey: crypto.randomUUID() })
      expect(((await ok.json()) as { awarded: number }).awarded).toBe(1)
    }
    const over = await teamAward(hostess, { teamId: team.id, points: 1, awardKey: crypto.randomUUID() })
    expect(over.status).toBe(200)
    expect(((await over.json()) as { awarded: number }).awarded).toBe(0)
    const sum = await prisma.activityLog.aggregate({
      where: { participantId: member.id, actionType: 'team_bonus' },
      _sum: { pointsAwarded: true },
    })
    expect(sum._sum.pointsAwarded).toBe(100)
  })

  test('a role change that commits during an award keeps staff out of it', async () => {
    const team = await prisma.team.create({ data: { name: 'Альфа' } })
    const member = await register('user', team.id)
    const hostess = await register('hostess')
    let award: Promise<Response> | undefined
    await prisma.$transaction(async (tx) => {
      await acquireParticipantScoringLock(tx, member.id)
      award = Promise.resolve(teamAward(hostess, { teamId: team.id, points: 5, awardKey: crypto.randomUUID() }))
      await Bun.sleep(300) // the award is now waiting for this participant's lock
      await tx.user.update({ where: { id: member.id }, data: { role: 'hostess' } })
    })
    expect((await award!).status).toBe(409) // the team has no participants left
    expect(await prisma.activityLog.count({ where: { actionType: 'team_bonus' } })).toBe(0)
  })

  test('only staff award; bad input, unknown and empty teams are refused', async () => {
    const team = await prisma.team.create({ data: { name: 'Альфа' } })
    const empty = await prisma.team.create({ data: { name: 'Пустая' } })
    const participant = await register('user', team.id)
    const hostess = await register('hostess')
    const body = { teamId: team.id, points: 5, awardKey: crypto.randomUUID() }

    expect((await teamAward(participant, body)).status).toBe(403)
    expect((await app.request('/api/hostess/team-award', { method: 'POST' })).status).toBe(401)
    expect((await api('GET', '/api/hostess/teams', participant)).status).toBe(403)
    expect(await prisma.activityLog.count()).toBe(0)

    for (const points of [0, 51, 1.5]) {
      expect((await teamAward(hostess, { ...body, points })).status, String(points)).toBe(400)
    }
    expect((await teamAward(hostess, { ...body, awardKey: 'x' })).status).toBe(400)

    const unknown = await teamAward(hostess, { ...body, teamId: crypto.randomUUID() })
    expect(unknown.status).toBe(404)
    const nobody = await teamAward(hostess, { ...body, teamId: empty.id })
    expect(nobody.status).toBe(409)
    expect(((await nobody.json()) as { error: { code: string } }).error.code).toBe('EVENT_TEAM_EMPTY')
    expect(await prisma.activityLog.count()).toBe(0)
  })

  const at = (minutes: number) => new Date(Date.UTC(2030, 0, 1, 12, minutes)).toISOString()
  const schedule = (who: Person) => api('GET', '/api/event/schedule', who)
  const setSchedule = (who: Person, teamId: string, body: unknown) =>
    api('PUT', `/api/admin/teams/${teamId}/schedule`, who, body)

  test('the schedule is open to every signed-in role: by start, unscheduled last then by name', async () => {
    const late = await prisma.team.create({ data: { name: 'Поздняя', startsAt: at(60), endsAt: at(75) } })
    const early = await prisma.team.create({ data: { name: 'Ранняя', startsAt: at(0), endsAt: at(15) } })
    const none = await prisma.team.create({ data: { name: 'Без времени' } })
    const nobody = await prisma.team.create({ data: { name: 'Абсолютно без времени' } })

    for (const role of ['user', 'hostess', 'admin'] as const) {
      const who = await register(role)
      const before = Date.now()
      const response = await schedule(who)
      expect(response.status, role).toBe(200)
      const body = (await response.json()) as {
        serverNow: string
        teams: { id: string; name: string; startsAt: string | null; endsAt: string | null }[]
      }
      expect(Math.abs(Date.parse(body.serverNow) - before)).toBeLessThan(10_000)
      expect(body.teams).toEqual([
        { id: early.id, name: 'Ранняя', startsAt: at(0), endsAt: at(15) },
        { id: late.id, name: 'Поздняя', startsAt: at(60), endsAt: at(75) },
        { id: nobody.id, name: 'Абсолютно без времени', startsAt: null, endsAt: null },
        { id: none.id, name: 'Без времени', startsAt: null, endsAt: null },
      ])
    }
    expect((await app.request('/api/event/schedule')).status).toBe(401)
  })

  test('an administrator lists teams with counts and sets, replaces and clears a slot', async () => {
    const admin = await register('admin')
    const team = await prisma.team.create({ data: { name: 'Альфа' } })
    await register('user', team.id)

    const listed = (await (await api('GET', '/api/admin/teams', admin)).json()) as {
      teams: { id: string; name: string; memberCount: number; startsAt: string | null; endsAt: string | null }[]
    }
    expect(listed.teams).toEqual([
      { id: team.id, name: 'Альфа', memberCount: 1, startsAt: null, endsAt: null },
    ])

    const set = await setSchedule(admin, team.id, { startsAt: at(0), endsAt: at(15) })
    expect(set.status).toBe(200)
    expect(await set.json()).toEqual({ id: team.id, name: 'Альфа', memberCount: 1, startsAt: at(0), endsAt: at(15) })
    expect((await setSchedule(admin, team.id, { startsAt: at(30), endsAt: at(50) })).status).toBe(200)
    const row = await prisma.team.findUniqueOrThrow({ where: { id: team.id } })
    expect([row.startsAt?.toISOString(), row.endsAt?.toISOString()]).toEqual([at(30), at(50)])

    expect((await setSchedule(admin, team.id, { startsAt: null, endsAt: null })).status).toBe(200)
    const cleared = await prisma.team.findUniqueOrThrow({ where: { id: team.id } })
    expect([cleared.startsAt, cleared.endsAt]).toEqual([null, null])
  })

  test('a bad slot is refused with a clear message and changes nothing; unknown team is 404', async () => {
    const admin = await register('admin')
    const team = await prisma.team.create({ data: { name: 'Альфа', startsAt: at(0), endsAt: at(15) } })

    const bad: unknown[] = [
      { startsAt: at(0), endsAt: null },
      { startsAt: null, endsAt: at(15) },
      { startsAt: at(15), endsAt: at(15) },
      { startsAt: at(15), endsAt: at(0) },
      { startsAt: 'вчера', endsAt: at(15) },
      { startsAt: at(0) },
    ]
    for (const body of bad) {
      const response = await setSchedule(admin, team.id, body)
      expect(response.status, JSON.stringify(body)).toBe(400)
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR')
    }
    const order = (await (await setSchedule(admin, team.id, { startsAt: at(15), endsAt: at(0) })).json()) as {
      error: { message: string }
    }
    expect(order.error.message).toBe('Конец выступления должен быть позже его начала')
    const row = await prisma.team.findUniqueOrThrow({ where: { id: team.id } })
    expect([row.startsAt?.toISOString(), row.endsAt?.toISOString()]).toEqual([at(0), at(15)])

    expect((await setSchedule(admin, crypto.randomUUID(), { startsAt: at(0), endsAt: at(15) })).status).toBe(404)
    expect((await setSchedule(admin, 'not-a-uuid', { startsAt: null, endsAt: null })).status).toBe(400)
  })

  test('only administrators touch the schedule', async () => {
    const team = await prisma.team.create({ data: { name: 'Альфа' } })
    for (const role of ['user', 'hostess'] as const) {
      const who = await register(role)
      expect((await api('GET', '/api/admin/teams', who)).status, role).toBe(403)
      expect((await setSchedule(who, team.id, { startsAt: at(0), endsAt: at(15) })).status, role).toBe(403)
    }
    expect((await app.request(`/api/admin/teams/${team.id}/schedule`, { method: 'PUT' })).status).toBe(401)
    const row = await prisma.team.findUniqueOrThrow({ where: { id: team.id } })
    expect(row.startsAt).toBeNull()
  })

  test('the database refuses a slot with one time or a reversed one', async () => {
    const team = await prisma.team.create({ data: { name: 'Альфа' } })
    const update = async (data: { startsAt?: Date; endsAt?: Date }) => {
      await prisma.team.update({ where: { id: team.id }, data })
    }
    await expect(update({ startsAt: new Date() })).rejects.toThrow()
    await expect(update({ startsAt: new Date(), endsAt: new Date(0) })).rejects.toThrow()
  })
})
