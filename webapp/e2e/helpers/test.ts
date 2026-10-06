import type { Page } from '@playwright/test'

export { expect, test } from '@playwright/test'

export const e2ePassword = 'password123'

export function uniqueEmail(prefix = 'web-e2e') {
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '')
  const suffix = Math.random().toString(36).slice(2, 8)

  return `${prefix}-${timestamp}-${suffix}@example.com`
}

type SignupProfile = {
  city?: string
  company?: string
  /** Tick the consent box (default). Pass false to leave it for the consent popup to catch. */
  consent?: boolean
  firstName?: string
  lastName?: string
}

/** Fills the signup form the page already shows. */
export async function fillSignupForm(page: Page, email: string, profile: SignupProfile = {}) {
  await page.getByTestId('signup-email').fill(email)
  await page.getByTestId('signup-firstName').fill(profile.firstName ?? 'Анна')
  await page.getByTestId('signup-lastName').fill(profile.lastName ?? 'Петрова')
  await page.getByTestId('signup-company').fill(profile.company ?? 'Завод')
  await page.getByTestId('signup-city').fill(profile.city ?? 'Тюмень')
  await page.getByTestId('signup-password').fill(e2ePassword)
  if (profile.consent !== false) await page.getByTestId('signup-consent').check()
}

export async function signUp(page: Page, email: string, profile: SignupProfile = {}) {
  await page.goto('/signup')
  await fillSignupForm(page, email, profile)
  await page.getByTestId('signup-submit').click()
}

/** Submits the login form the page already shows. */
export async function logIn(page: Page, email: string, password = e2ePassword) {
  await page.getByTestId('login-email').fill(email)
  await page.getByTestId('login-password').fill(password)
  await page.getByTestId('login-submit').click()
}

/** Participants sign out from the header. */
export async function logOut(page: Page) {
  await page.getByTestId('logout').click()
}

/** Administrators sign out from the account menu of the sidebar. */
export async function adminLogOut(page: Page) {
  await page.getByTestId('account-menu').click()
  await page.getByTestId('account-menu-logout').click()
}

/**
 * A fresh access token for the page's session. The app keeps its own token in memory only, so the
 * test asks the same refresh endpoint the app uses, with the page's cookie.
 */
export async function accessTokenOf(page: Page) {
  const response = await page.request.post(`${process.env.E2E_BACKEND_URL}/api/auth/refresh`, {
    data: {},
    headers: { Origin: process.env.E2E_WEB_URL ?? '' },
  })
  if (!response.ok()) throw new Error(`Refresh failed with HTTP ${response.status()}`)
  return ((await response.json()) as { accessToken: string }).accessToken
}
