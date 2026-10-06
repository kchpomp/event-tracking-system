import assert from 'node:assert/strict'
import { test } from 'node:test'

import { getEntryActions, resolvePublicWebappUrl } from '../src/lib/landing-actions'

/**
 * The landing page's copy and section list are deliberately untested: they are content, and a test
 * asserting them turns red for work that is entirely correct. What is tested is the environment
 * contract that survives every rewrite: `PUBLIC_WEBAPP_URL` is either unset or a real origin.
 */
test('a blank PUBLIC_WEBAPP_URL means no link, an http(s) URL is kept, and anything else fails', () => {
  assert.equal(resolvePublicWebappUrl(undefined), undefined)
  assert.equal(resolvePublicWebappUrl(''), undefined)
  assert.equal(resolvePublicWebappUrl('   '), undefined)

  assert.equal(resolvePublicWebappUrl('  https://app.example.com  '), 'https://app.example.com')
  assert.equal(resolvePublicWebappUrl('http://localhost:5173/'), 'http://localhost:5173/')

  for (const value of ['app.example.com', '/app', 'https://', 'ftp://app.example.com', 'javascript:alert(1)']) {
    assert.throws(
      () => resolvePublicWebappUrl(value),
      (error: unknown) =>
        error instanceof Error &&
        error.message.includes('PUBLIC_WEBAPP_URL') &&
        error.message.includes(value),
      `expected ${JSON.stringify(value)} to be rejected with an error that names the variable and the value`,
    )
  }
})

test('the entry links point at the sign-in and registration pages, and are absent without a webapp', () => {
  assert.equal(getEntryActions(), null)
  assert.equal(getEntryActions('   '), null)
  assert.deepEqual(getEntryActions('  https://app.example.com  '), {
    login: 'https://app.example.com/login',
    signup: 'https://app.example.com/signup',
  })
  assert.deepEqual(getEntryActions('http://localhost:5173/'), {
    login: 'http://localhost:5173/login',
    signup: 'http://localhost:5173/signup',
  })
  assert.throws(() => getEntryActions('app.example.com'), /PUBLIC_WEBAPP_URL/)
})
