import { expect, test } from 'bun:test'

import { detectImageFormat } from '../src/modules/uploads'
import { placeholderPortraitPng } from './placeholder-portrait'

test('placeholder portraits are valid, distinct PNGs within the planned-photo limits', () => {
  const images = [0, 1, 2, 3].map(placeholderPortraitPng)
  for (const png of images) {
    expect(detectImageFormat(png.subarray(0, 32))).toBe('image/png')
    expect(png.byteLength).toBeGreaterThan(64)
    expect(png.byteLength).toBeLessThan(5 * 1024 * 1024)
  }
  expect(new Set(images.map((png) => png.toString('base64'))).size).toBe(4)
})
