import { expect as playwrightExpect, type Locator, type Page } from '@playwright/test'

export { expect, test } from '@playwright/test'

export const e2ePassword = 'password123'

export function uniqueEmail(prefix = 'web-e2e') {
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '')
  const suffix = Math.random().toString(36).slice(2, 8)

  return `${prefix}-${timestamp}-${suffix}@example.com`
}

type SignupProfile = {
  /** The name of an entry of the city list (default «Нижневартовск»). */
  city?: string
  /** The name of an entry of the company list (default «СИБУР (головной офис)»). */
  company?: string
  /** Tick the consent box (default). Pass false to leave it for the consent popup to catch. */
  consent?: boolean
  firstName?: string
  lastName?: string
  /** Register as a hostess: no company and no city (the address must be in the hostess list). */
  hostess?: boolean
}

/** Fills the signup form the page already shows. */
export async function fillSignupForm(page: Page, email: string, profile: SignupProfile = {}) {
  await page.getByTestId('signup-email').fill(email)
  await page.getByTestId('signup-firstName').fill(profile.firstName ?? 'Анна')
  await page.getByTestId('signup-lastName').fill(profile.lastName ?? 'Петрова')
  if (profile.hostess) {
    await page.getByTestId('signup-as-hostess').click()
  } else {
    await page.getByTestId('signup-company').selectOption({ label: profile.company ?? 'СИБУР (головной офис)' })
    await page.getByTestId('signup-city').selectOption({ label: profile.city ?? 'Нижневартовск' })
  }
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

/**
 * Every title, description and icon of a popup sits on its centre line: the text is centre-aligned
 * and its box is centred in the dialog. Buttons are checked by the footer test next to this one.
 */
export async function expectCentredContent(dialog: Locator, name: string) {
  const box = (await dialog.boundingBox())!
  const dialogCentre = box.x + box.width / 2
  const parts = dialog.locator('[data-slot$="title"], [data-slot$="description"], [data-slot$="media"]')
  const count = await parts.count()
  playwrightExpect(count, `${name}: the popup has a title`).toBeGreaterThan(0)
  for (let index = 0; index < count; index += 1) {
    const part = parts.nth(index)
    const slot = await part.getAttribute('data-slot')
    const { align, centre } = await part.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return { align: getComputedStyle(element).textAlign, centre: rect.x + rect.width / 2 }
    })
    if (!slot?.endsWith('media')) playwrightExpect(align, `${name}: ${slot} text is centred`).toBe('center')
    playwrightExpect(Math.abs(centre - dialogCentre), `${name}: ${slot} is on the centre line`).toBeLessThanOrEqual(2)
  }
}
