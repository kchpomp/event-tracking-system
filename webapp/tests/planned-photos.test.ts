import { expect, test } from 'bun:test'

import { chunk, emailFromFileName, matchPhotoFiles, runPool } from '../src/features/event/planned-photos'

test('takes the email from the file name and rejects other formats', () => {
  expect(emailFromFileName('Anna@Example.RU.JPG')).toBe('anna@example.ru')
  expect(emailFromFileName('oleg@example.com.webp')).toBe('oleg@example.com')
  expect(emailFromFileName('oleg@example.com.heic')).toBeNull()
  expect(emailFromFileName('oleg@example.com')).toBeNull()
})

test('reports matched, unlisted, duplicate and unsupported files', () => {
  const files = ['a@x.ru.jpg', 'b@x.ru.png', 'b@x.ru.jpeg', 'c@x.ru.jpg', 'a2@x.ru.gif'].map((name) => ({ name }))
  const report = matchPhotoFiles(files, new Set(['a@x.ru', 'b@x.ru']))
  expect(report.matched.map((item) => item.email)).toEqual(['a@x.ru'])
  expect(report.duplicates.map((file) => file.name)).toEqual(['b@x.ru.png', 'b@x.ru.jpeg'])
  expect(report.notListed.map((file) => file.name)).toEqual(['c@x.ru.jpg'])
  expect(report.unsupported.map((file) => file.name)).toEqual(['a2@x.ru.gif'])
})

test('splits into batches of at most 50 by default', () => {
  const batches = chunk(Array.from({ length: 120 }, (_, index) => index))
  expect(batches.map((batch) => batch.length)).toEqual([50, 50, 20])
  expect(chunk([])).toEqual([])
})

test('the pool never runs more than the limit at once', async () => {
  let active = 0
  let peak = 0
  await runPool(Array.from({ length: 10 }, (_, index) => index), 4, async () => {
    active++
    peak = Math.max(peak, active)
    await new Promise((resolve) => setTimeout(resolve, 2))
    active--
  })
  expect(peak).toBe(4)
})
