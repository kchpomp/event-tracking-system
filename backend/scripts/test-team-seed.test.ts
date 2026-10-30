import { expect, test } from 'bun:test'

import { testTeamSlots } from './test-team-seed'

test('the test teams perform 12 and 30 minutes from now, 15 minutes each', () => {
  const now = new Date('2030-01-01T12:00:00Z')
  expect(testTeamSlots(now).map((slot) => [slot.startsAt.toISOString(), slot.endsAt.toISOString()])).toEqual([
    ['2030-01-01T12:12:00.000Z', '2030-01-01T12:27:00.000Z'],
    ['2030-01-01T12:30:00.000Z', '2030-01-01T12:45:00.000Z'],
  ])
})
