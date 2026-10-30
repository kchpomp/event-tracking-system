import { config as loadDotenv } from 'dotenv'
import { randomBytes } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { createApp } from '../src/app'
import { createPrisma } from '../src/db'
import { loadEnv } from '../src/env'
import { bootstrapAdmin } from '../src/modules/users/infrastructure/admin-bootstrap'
import { parseTestTeamSeedConfig, TEST_USER_COUNT } from './test-team-seed-config'
import { seedTestTeam } from './test-team-seed'

// The six accounts live in backend/.env.test-users (git-ignored); see .env.example for the names.
// A first run writes the file with random passwords; they are never printed.
loadDotenv({ quiet: true })
const credentialsFile = fileURLToPath(new URL('../.env.test-users', import.meta.url))
if (!existsSync(credentialsFile)) {
  const lines = Array.from({ length: TEST_USER_COUNT }, (_, i) => [
    `TEST_USER_${i + 1}_EMAIL="test${i + 1}@example.invalid"`,
    `TEST_USER_${i + 1}_PASSWORD="${randomBytes(18).toString('base64url')}"`,
  ]).flat()
  writeFileSync(credentialsFile, `${lines.join('\n')}\n`, { mode: 0o600 })
  console.log('Wrote backend/.env.test-users with random passwords (git-ignored).')
}
loadDotenv({ path: credentialsFile, quiet: true })

const config = parseTestTeamSeedConfig(process.env)
const prisma = createPrisma(config.databaseUrl)

try {
  await bootstrapAdmin(prisma, config.admin)
  const app = createApp({ env: loadEnv(process.env), prisma })
  const result = await seedTestTeam({ admin: config.admin, app, db: prisma, users: config.users })
  console.log(
    `Seeded teams ${result.teams.map((name) => `"${name}"`).join(', ')} with ${result.participants} participants and ${result.photos} placeholder photos in ${config.host}. Schedule from now: "${result.teams[0]}" at ${result.slots[0]!.startsAt.toLocaleTimeString()} (popup 10 minutes before), "${result.teams[1]}" at ${result.slots[1]!.startsAt.toLocaleTimeString()}, each for 15 minutes; rerun to reset.`,
  )
} finally {
  await prisma.$disconnect()
}
