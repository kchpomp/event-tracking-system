import type { TokenAuthResponse } from '@event-tracking-system/contracts'

import type { createApp } from '../src/app'
import type { DbClient } from '../src/db'
import { TEST_TEAM_NAMES, TEST_USER_COUNT } from './test-team-seed-config'
import { placeholderPortraitPng } from './placeholder-portrait'

type App = ReturnType<typeof createApp>
type Credentials = { email: string; password: string }

const DEPARTMENT = 'Тестовое подразделение'
const CITY = 'Тестоград'
const PHOTOS = TEST_USER_COUNT - 1 // all but the last get a placeholder portrait
const MINUTE = 60_000

/**
 * Slots relative to `now`, in the order of TEST_TEAM_NAMES: А starts in 12 minutes, Б in 30, each
 * for 15. So the 10-minute reminder and the "performing now" badge can both be tried within half an hour.
 */
export function testTeamSlots(now: Date) {
  return [12, 30].map((offset) => ({
    startsAt: new Date(now.getTime() + offset * MINUTE),
    endsAt: new Date(now.getTime() + (offset + 15) * MINUTE),
  }))
}

/**
 * Creates two teams and their six participants, lists them in the guest list (which also adds their
 * department and city to the sign-up form) and stores the placeholder portraits through the
 * administrator endpoints, i.e. the same ticket, PUT, finalize path as real guest photos.
 * Safe to repeat: existing rows are reused, and a photo that is already stored is kept. Each run
 * moves the two performance slots to "now" again (see testTeamSlots).
 */
export async function seedTestTeam({
  admin,
  app,
  db,
  now = new Date(),
  users,
}: {
  admin: Credentials
  app: App
  db: DbClient
  now?: Date
  users: Credentials[]
}) {
  const call = (method: string, path: string, token: string | null, body?: unknown) =>
    app.request(path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  const ok = async (response: Response, what: string) => {
    if (!response.ok) throw new Error(`${what} failed: ${response.status} ${await response.text()}`)
    return response
  }

  const login = await ok(await call('POST', '/api/auth/token/login', null, admin), 'Administrator sign-in')
  const token = ((await login.json()) as TokenAuthResponse).accessToken

  const people = users.map((user, index) => ({
    ...user,
    firstName: 'Тест',
    lastName: `Участник${index + 1}`,
    photo: index < PHOTOS ? placeholderPortraitPng(index) : null,
  }))

  await ok(
    await call('POST', '/api/admin/planned-participants', token, {
      kind: 'participant',
      entries: people.map((p) => ({
        email: p.email,
        firstName: p.firstName,
        lastName: p.lastName,
        department: DEPARTMENT,
        city: CITY,
      })),
    }),
    'Guest list import',
  )

  const [teams, company, city] = await Promise.all([
    Promise.all(
      TEST_TEAM_NAMES.map((name) => db.team.upsert({ where: { name }, create: { name }, update: {} })),
    ),
    db.company.findUniqueOrThrow({ where: { name: DEPARTMENT } }),
    db.city.findUniqueOrThrow({ where: { name: CITY } }),
  ])

  const slots = testTeamSlots(now)
  for (const [index, team] of teams.entries()) {
    await db.team.update({ where: { id: team.id }, data: slots[index]! })
  }

  for (const [index, person] of people.entries()) {
    const team = teams[index % teams.length]!
    const existing = await db.user.findUnique({
      where: { email: person.email },
      select: { id: true, role: true, passwordHash: true },
    })
    if (existing && existing.role !== 'user') {
      throw new Error(`${person.email} already belongs to a ${existing.role}, not a test participant`)
    }
    const keepHash =
      existing?.passwordHash && (await Bun.password.verify(person.password, existing.passwordHash))
    const passwordHash = keepHash
      ? undefined
      : await Bun.password.hash(person.password, { algorithm: 'argon2id' })
    const data = {
      firstName: person.firstName,
      lastName: person.lastName,
      displayName: `${person.firstName} ${person.lastName}`,
      companyId: company.id,
      cityId: city.id,
      teamId: team.id,
      ...(passwordHash ? { passwordHash } : {}),
    }
    if (existing) {
      await db.user.update({ where: { id: existing.id }, data })
    } else {
      await db.user.create({
        data: { ...data, email: person.email, role: 'user', consentedAt: new Date() },
      })
    }

    if (person.photo) await storePhoto(person.email, person.photo)
  }

  async function storePhoto(email: string, png: Buffer) {
    const row = await db.plannedParticipant.findUniqueOrThrow({
      where: { email },
      select: { photoObjectKey: true },
    })
    if (row.photoObjectKey) return

    const ticketResponse = await ok(
      await call('POST', '/api/admin/planned-participants/photos/tickets', token, {
        items: [{ email, contentType: 'image/png', byteSize: png.byteLength }],
      }),
      'Photo ticket',
    )
    const [ticket] = ((await ticketResponse.json()) as {
      tickets: { objectKey: string; upload: { url: string; headers: Record<string, string> } }[]
    }).tickets
    await ok(
      await app.request(ticket!.upload.url, {
        method: 'PUT',
        headers: ticket!.upload.headers,
        body: new Uint8Array(png),
      }),
      'Photo upload',
    )
    const done = await ok(
      await call('POST', '/api/admin/planned-participants/photos/finalize', token, {
        items: [{ email, objectKey: ticket!.objectKey }],
      }),
      'Photo finalize',
    )
    const [result] = ((await done.json()) as { results: { status: string }[] }).results
    if (result?.status !== 'stored') throw new Error(`Photo for ${email} was ${result?.status}`)
  }

  return { teams: teams.map((team) => team.name), participants: people.length, photos: PHOTOS, slots }
}
