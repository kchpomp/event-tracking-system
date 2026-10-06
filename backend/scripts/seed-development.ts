import 'dotenv/config'

import { createPrisma } from '../src/db'
import { seedDemoFixtures } from './demo-fixtures'
import { parseDevelopmentSeedConfig } from './development-seed-config'
import { bootstrapDevelopmentData } from './development-seed'
import { seedEvent } from '../src/modules/event/infrastructure/event-seed'

const config = parseDevelopmentSeedConfig(process.env)
const prisma = createPrisma(config.databaseUrl)

try {
  const result = await bootstrapDevelopmentData(prisma, config.accounts)
  console.log(`Seeded development administrator ${result.admin.email}.`)
  console.log(`Seeded development user ${result.user.email}.`)
  if ((await seedEvent(prisma)).created) console.log('Seeded the event and its stations.')

  // Opt-in: `DEV_SEED_DEMO=1 bun run dev:seed` (or the screens run, through its own config).
  if (config.demo) {
    const demo = await seedDemoFixtures(prisma)
    console.log(`Seeded ${demo.count} demo fixture users.`)
  }
} finally {
  await prisma.$disconnect()
}
