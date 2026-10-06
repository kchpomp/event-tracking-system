import { POLYMER_GROUP } from '@event-tracking-system/contracts'

import type { DbClient } from '../../../db'

// The stations of the first event, as seeded in the earlier project. Points are PLACEHOLDERS the
// organizers still have to confirm. "Полимер решений" is ten placement QR codes (1st place = 10
// points ... 10th = 1) that look like ONE card in the app; a participant is awarded once in total.
function stationsToSeed() {
  const polymerSuccess = 'Спасибо за участие в «Полимере решений»!'
  return [
    { name: 'Точка соединения', points: 1 },
    ...Array.from({ length: 10 }, (_, index) => ({
      name: 'Полимер решений',
      points: 10 - index,
      displayGroup: POLYMER_GROUP,
      successMessage: polymerSuccess,
    })),
    {
      name: 'Люди формулы будущего',
      points: 1,
      successMessage: 'Спасибо! Вы стали частью «Людей Формулы будущего».',
    },
    { name: 'Воркшоп 1', points: 1 },
    { name: 'Воркшоп 2', points: 1 },
    { name: 'Воркшоп 3', points: 1 },
  ]
}

/**
 * Creates the first event with its stations, once. A database that already has an event is left
 * alone, so running it again never regenerates the QR tokens that may already be printed.
 *
 * Tokens are random (`crypto.randomUUID()`): a guessable token would let someone claim a
 * station's points without being there. The admin stations page shows them for printing.
 */
export async function seedEvent(db: DbClient, now = new Date()) {
  if ((await db.event.count()) > 0) return { created: false as const }

  await db.event.create({
    data: {
      isActive: true,
      stations: {
        create: stationsToSeed().map((station, index) => ({
          ...station,
          qrToken: crypto.randomUUID(),
          // Spaced out: the app lists stations in creation order.
          createdAt: new Date(now.getTime() + index * 1000),
        })),
      },
    },
  })
  return { created: true as const }
}
