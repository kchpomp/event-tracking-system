import { expect, test } from 'bun:test'

import { squareCrop } from '../src/features/event/avatar-photo'
import { PHOTO_SIDE } from '../src/features/event/planned-photos'

test('crops the largest centred square from a wide or a tall picture', () => {
  expect(squareCrop(4000, 3000)).toEqual({ x: 500, y: 0, side: 3000 })
  expect(squareCrop(3000, 4000)).toEqual({ x: 0, y: 500, side: 3000 })
  expect(squareCrop(300, 300)).toEqual({ x: 0, y: 0, side: 300 })
})

test('every stored photo is a 256 px square', () => {
  expect(PHOTO_SIDE).toBe(256)
})
