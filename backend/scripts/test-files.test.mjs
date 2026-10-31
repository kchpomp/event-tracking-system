import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'bun:test'

import { backendTestFiles } from './test-files.mjs'

const backendRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')

describe('backendTestFiles', () => {
  const { all, parked, unit, integration, live } = backendTestFiles(backendRoot)

  test('every test file reaches exactly one runner, or is explicitly parked', () => {
    // Losing a file does not fail anything by itself: it simply stops running, and the suite
    // still exits 0. This is the only place that notices. The three sets cannot overlap by
    // construction - `unit` is defined as neither of the others - so completeness is the
    // property worth asserting.
    expect([...unit, ...integration, ...live, ...parked].sort()).toEqual(all)
    expect(all.length).toBeGreaterThan(0)
  })

  test('a suite marked @parked-test runs in neither runner but is still accounted for', async () => {
    // Capabilities that ship switched off keep their tests compiling without running them. The
    // marker lives in the test file, so switching the capability on is one deletion in one place.
    const root = await mkdtemp(join(tmpdir(), 'backend-test-files-'))
    await mkdir(join(root, 'src'), { recursive: true })
    await writeFile(join(root, 'src/live.integration.test.ts'), '')
    await writeFile(join(root, 'src/off.integration.test.ts'), '// @parked-test\n')

    const split = backendTestFiles(root)

    expect(split.parked).toEqual(['src/off.integration.test.ts'])
    expect(split.integration).toEqual(['src/live.integration.test.ts'])
    expect(split.all).toContain('src/off.integration.test.ts')
  })

  test('the marker only counts in the leading comment, not in the body', async () => {
    // Otherwise this very file - which names the marker in a test title and a fixture - could
    // park itself after an innocent reordering, taking every guard in it out of both runners
    // while the suite still exits 0.
    const root = await mkdtemp(join(tmpdir(), 'backend-test-files-'))
    await mkdir(join(root, 'src'), { recursive: true })
    await writeFile(
      join(root, 'src/mentions.test.ts'),
      "import { test } from 'bun:test'\n\ntest('@parked-test is just a string here', () => {})\n",
    )

    expect(backendTestFiles(root).parked).toEqual([])
  })

  test('no suite is parked now that every switched-off capability is gone', () => {
    expect(parked).toEqual([])
  })

  test('tests needing a service no runner starts stay out of the fast suite', () => {
    // `bun run test` must stay runnable with no Docker daemon. A live test landing in the unit
    // set would fail for everyone who has not started a container, and a red suite people learn
    // to ignore is worse than no suite.
    expect(live).toContain('src/storage/s3-storage.live.test.ts')
    expect(unit.some((file) => file.includes('.live.test.'))).toBe(false)
  })

})
