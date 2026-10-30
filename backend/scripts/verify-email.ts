import { createPrisma } from '../src/db'

// Test helper: marks an address verified, as following the mailed link would. The e2e specs cannot
// read mail, and staff roles need a verified address.
const email = process.argv[2]
if (!email) throw new Error('usage: bun scripts/verify-email.ts <email>')

const db = createPrisma(process.env.DATABASE_URL!)
await db.user.update({ where: { email }, data: { emailVerifiedAt: new Date() } })
await db.$disconnect()
