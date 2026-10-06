import 'dotenv/config'

import { createPrisma } from '../src/db'
import { seedEvent } from '../src/modules/event/infrastructure/event-seed'

// Creates the first event and its stations when the database has none. Safe to repeat.
// Run after `bun run --cwd backend db:deploy`; the QR codes are printed from the admin stations page.
const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) throw new Error('DATABASE_URL is required')

const prisma = createPrisma(databaseUrl)
try {
  const result = await seedEvent(prisma)
  console.log(result.created ? 'Created the event and its stations.' : 'An event already exists; nothing changed.')
} finally {
  await prisma.$disconnect()
}
