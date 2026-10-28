import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createApp } from '../../app'
import { createPrisma } from '../../db'
import { loadEnv } from '../../env'
import { privateStorageConfigFromEnv, type FilesystemStorageConfig } from '../../storage/config'
import { createFilesystemStorageRoutes } from '../../storage/filesystem-routes'
import { FilesystemPrivateStorage } from '../../storage/filesystem-storage'
import { pngFixture } from '../../storage/storage-contract'
import { CITY_IDS, COMPANY_IDS } from '../../test-reference-ids'

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required; run bun run test:backend:integration')

const jpegFixture = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(pngFixture.byteLength - 4, 0x20),
])
const junk = Buffer.alloc(pngFixture.byteLength, 0x41)

const env = loadEnv({
  DATABASE_URL: databaseUrl,
  JWT_SECRET: '12345678901234567890123456789012',
  CORS_ORIGINS: 'http://localhost:5173',
  ACCESS_TOKEN_TTL_SECONDS: '600',
  AUTH_RATE_LIMIT_MAX: '5000',
})

describe('guest list photos', () => {
  const prisma = createPrisma(databaseUrl)
  let root: string
  let storage: FilesystemPrivateStorage
  let app: ReturnType<typeof createApp>

  beforeEach(async () => {
    await prisma.plannedParticipant.deleteMany()
    await prisma.userAvatar.deleteMany()
    await prisma.authSession.deleteMany()
    await prisma.user.deleteMany()
    root = await mkdtemp(join(tmpdir(), 'planned-photos-'))
    const config = privateStorageConfigFromEnv({
      ...env,
      PRIVATE_STORAGE_LOCAL_ROOT: root,
    }) as FilesystemStorageConfig
    storage = new FilesystemPrivateStorage(config)
    app = createApp({
      env,
      prisma,
      privateStorage: { storage, httpRoutes: createFilesystemStorageRoutes(config) },
    })
  })

  afterAll(async () => {
    await prisma.$disconnect()
    await rm(root, { recursive: true, force: true })
  })

  async function register(email: string, name = { firstName: 'Анна', lastName: 'Петрова' }) {
    const response = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'password-1234',
        ...name,
        companyId: COMPANY_IDS[0],
        cityId: CITY_IDS[0],
        consent: true,
      }),
    })
    expect(response.status).toBe(201)
    const body = (await response.json()) as { accessToken: string; user: { id: string } }
    return { accessToken: body.accessToken, id: body.user.id }
  }

  async function registerAdmin() {
    const admin = await register('admin@example.com')
    await prisma.user.update({ where: { id: admin.id }, data: { role: 'admin' } })
    return admin
  }

  const api = (method: string, path: string, accessToken: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })

  const listGuest = (token: string, email = 'anna@example.com', fullName = 'Петрова Анна Ивановна') =>
    api('POST', '/api/admin/planned-participants', token, {
      kind: 'participant',
      entries: [{ email, fullName }],
    })

  type Ticket = {
    email: string
    objectKey: string
    upload: { url: string; headers: Record<string, string> }
  }

  async function tickets(token: string, items: unknown[]) {
    return api('POST', '/api/admin/planned-participants/photos/tickets', token, { items })
  }

  const finalize = (token: string, items: unknown[]) =>
    api('POST', '/api/admin/planned-participants/photos/finalize', token, { items })

  /** Ticket, PUT and finalize for one photo; returns the finalize status and the key. */
  async function uploadPhoto(token: string, email: string, bytes: Buffer, contentType = 'image/png') {
    const response = await tickets(token, [{ email, contentType, byteSize: bytes.byteLength }])
    expect(response.status).toBe(201)
    const [ticket] = ((await response.json()) as { tickets: Ticket[] }).tickets
    const put = await app.request(ticket!.upload.url, {
      method: 'PUT',
      headers: ticket!.upload.headers,
      body: new Uint8Array(bytes),
    })
    expect(put.status).toBe(200)
    const done = await finalize(token, [{ email, objectKey: ticket!.objectKey }])
    expect(done.status).toBe(200)
    const [result] = ((await done.json()) as { results: { status: string }[] }).results
    return { status: result!.status, objectKey: ticket!.objectKey }
  }

  async function hasPhoto(token: string, email: string) {
    const list = (await (await api('GET', '/api/admin/planned-participants', token)).json()) as {
      items: { email: string; hasPhoto: boolean }[]
    }
    return list.items.find((item) => item.email === email)?.hasPhoto
  }

  async function waitForDeletion(objectKey: string) {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if ((await storage.headObject(objectKey)) === null) return
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    throw new Error(`Storage object ${objectKey} was never deleted`)
  }

  test('carries a photo from ticket to stored, and shows it in the matching profile only', async () => {
    const admin = await registerAdmin()
    await listGuest(admin.accessToken)
    expect(await hasPhoto(admin.accessToken, 'anna@example.com')).toBe(false)

    const { status, objectKey } = await uploadPhoto(admin.accessToken, 'anna@example.com', pngFixture)
    expect(status).toBe('stored')
    expect(objectKey.startsWith('planned-photos/')).toBe(true)
    expect(await hasPhoto(admin.accessToken, 'anna@example.com')).toBe(true)

    const anna = await register('anna@example.com')
    const me = (await (await api('GET', '/api/event/me', anna.accessToken)).json()) as {
      profile: { photo: { url: string; expiresAt: string } | null }
    }
    expect(me.profile.photo).not.toBeNull()
    const download = await app.request(me.profile.photo!.url)
    expect(Buffer.from(await download.arrayBuffer())).toEqual(pngFixture)

    // The same address under another name must not open the listed person's photo.
    await prisma.user.update({ where: { id: anna.id }, data: { lastName: 'Сидорова' } })
    const other = (await (await api('GET', '/api/event/me', anna.accessToken)).json()) as {
      profile: { photo: unknown }
    }
    expect(other.profile.photo).toBeNull()
  })

  test('only an administrator issues tickets or finalizes', async () => {
    const admin = await registerAdmin()
    await listGuest(admin.accessToken)
    const user = await register('user@example.com')
    const item = { email: 'anna@example.com', contentType: 'image/png', byteSize: pngFixture.byteLength }

    expect((await tickets(user.accessToken, [item])).status).toBe(403)
    expect((await finalize(user.accessToken, [{ email: item.email, objectKey: 'planned-photos/x' }])).status).toBe(403)
    expect(
      (await app.request('/api/admin/planned-participants/photos/tickets', { method: 'POST' })).status,
    ).toBe(401)
  })

  test('refuses a ticket for an email that is not in the list', async () => {
    const admin = await registerAdmin()
    const response = await tickets(admin.accessToken, [
      { email: 'nobody@example.com', contentType: 'image/png', byteSize: pngFixture.byteLength },
    ])
    expect(response.status).toBe(404)
  })

  test('rejects bytes that are not the declared image and removes them', async () => {
    const admin = await registerAdmin()
    await listGuest(admin.accessToken)

    const { status, objectKey } = await uploadPhoto(admin.accessToken, 'anna@example.com', junk, 'image/jpeg')

    expect(status).toBe('rejected')
    expect(await hasPhoto(admin.accessToken, 'anna@example.com')).toBe(false)
    await waitForDeletion(objectKey)
  })

  test('reports a photo that was never uploaded', async () => {
    const admin = await registerAdmin()
    await listGuest(admin.accessToken)
    const response = await tickets(admin.accessToken, [
      { email: 'anna@example.com', contentType: 'image/png', byteSize: pngFixture.byteLength },
    ])
    const [ticket] = ((await response.json()) as { tickets: Ticket[] }).tickets
    const done = await finalize(admin.accessToken, [{ email: 'anna@example.com', objectKey: ticket!.objectKey }])
    expect(((await done.json()) as { results: { status: string }[] }).results[0]!.status).toBe('not_uploaded')
  })

  test('a finalize retry is safe', async () => {
    const admin = await registerAdmin()
    await listGuest(admin.accessToken)
    const { objectKey } = await uploadPhoto(admin.accessToken, 'anna@example.com', pngFixture)

    const again = await finalize(admin.accessToken, [{ email: 'anna@example.com', objectKey }])
    expect(((await again.json()) as { results: { status: string }[] }).results[0]!.status).toBe('stored')
    expect(await storage.headObject(objectKey)).not.toBeNull()
  })

  test('a new photo replaces the old one and deletes its file', async () => {
    const admin = await registerAdmin()
    await listGuest(admin.accessToken)
    const first = await uploadPhoto(admin.accessToken, 'anna@example.com', pngFixture)
    const second = await uploadPhoto(admin.accessToken, 'anna@example.com', jpegFixture, 'image/jpeg')

    expect(second.status).toBe('stored')
    await waitForDeletion(first.objectKey)
    expect(await storage.headObject(second.objectKey)).not.toBeNull()
  })

  test('removing a list entry deletes its photo file', async () => {
    const admin = await registerAdmin()
    await listGuest(admin.accessToken)
    const { objectKey } = await uploadPhoto(admin.accessToken, 'anna@example.com', pngFixture)
    const row = await prisma.plannedParticipant.findFirstOrThrow()

    expect((await api('DELETE', `/api/admin/planned-participants/${row.id}`, admin.accessToken)).status).toBe(200)
    await waitForDeletion(objectKey)
  })

  test('an own avatar wins over the listed photo', async () => {
    const admin = await registerAdmin()
    await listGuest(admin.accessToken)
    await uploadPhoto(admin.accessToken, 'anna@example.com', pngFixture)
    const anna = await register('anna@example.com')

    const ticketResponse = await api('POST', '/api/uploads/avatar', anna.accessToken, {
      contentType: 'image/jpeg',
      byteSize: jpegFixture.byteLength,
    })
    const { upload } = (await ticketResponse.json()) as {
      upload: { uploadId: string; url: string; headers: Record<string, string> }
    }
    await app.request(upload.url, { method: 'PUT', headers: upload.headers, body: new Uint8Array(jpegFixture) })
    await api('POST', `/api/uploads/avatar/${upload.uploadId}/finalize`, anna.accessToken)

    const me = (await (await api('GET', '/api/event/me', anna.accessToken)).json()) as {
      profile: { photo: { url: string } }
    }
    const download = await app.request(me.profile.photo.url)
    expect(Buffer.from(await download.arrayBuffer())).toEqual(jpegFixture)
  })
})
