import { expect, fillSignupForm, logIn, logOut, signUp, test, uniqueEmail } from '../helpers/test'

test('registers, restores the session, opens the profile, and logs out and in again', async ({ page }) => {
  const email = uniqueEmail()

  await signUp(page, email, { firstName: 'Ирина', lastName: 'Орлова', company: 'ЗапСибНефтехим', city: 'Пермь' })

  await expect(page).toHaveURL(/\/app$/)
  await expect(page.getByTestId('total-points')).toBeVisible()

  // The access token lives in memory, so after a reload only the refresh cookie can sign in.
  await page.reload()
  await expect(page.getByTestId('total-points')).toBeVisible()

  await page.getByTestId('nav-profile').click()
  await expect(page).toHaveURL(/\/app\/profile$/)
  await expect(page.getByTestId('profile-email')).toHaveText(email)
  await expect(page.getByTestId('profile-firstName')).toHaveText('Ирина')

  await logOut(page)
  await expect(page.getByTestId('login-form')).toBeVisible()
  await logIn(page, email)
  // The page the person left from is restored: they signed out on the profile page.
  await expect(page).toHaveURL(/\/app\/profile$/)
  await expect(page.getByTestId('profile-email')).toHaveText(email)
})

test('shows a clear message for a wrong password', async ({ page }) => {
  await page.goto('/login')
  await logIn(page, uniqueEmail('nobody'), 'wrong-password-123')
  await expect(page.getByText('Неверный email или пароль.')).toBeVisible()
})

test('shows generic forgot-password success and handles an invalid reset link', async ({ page }) => {
  await page.goto('/login')
  await page.getByTestId('forgot-password-link').click()
  await expect(page).toHaveURL(/\/forgot-password$/)

  await page.getByTestId('forgot-password-email').fill(uniqueEmail('unknown-reset'))
  await page.getByTestId('forgot-password-submit').click()
  await expect(page.getByTestId('forgot-password-accepted')).toBeVisible()

  await page.goto('/reset-password#token=truncated')
  await expect(page).toHaveURL(/\/reset-password$/)
  await expect(page.getByTestId('reset-password-submit')).toBeDisabled()
})

test('keeps one logical browser session active across concurrent tabs', async ({ page }) => {
  const email = uniqueEmail('web-e2e-tabs')

  await signUp(page, email)
  await expect(page).toHaveURL(/\/app$/)

  const secondPage = await page.context().newPage()
  await secondPage.goto('/')
  await expect(secondPage).toHaveURL(/\/app$/)

  await Promise.all([page.reload(), secondPage.reload()])
  await expect(page.getByTestId('total-points')).toBeVisible()
  await expect(secondPage.getByTestId('total-points')).toBeVisible()

  await page.route('**/api/auth/logout', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'UNAVAILABLE', message: 'Temporary logout failure' } }),
    })
  })
  await logOut(page)
  await expect(page.getByTestId('logout-error')).toBeVisible()
  await expect(page.getByTestId('total-points')).toBeVisible()

  await logOut(secondPage)
  await expect(secondPage.getByTestId('login-form')).toBeVisible()
  await expect(page.getByTestId('login-form')).toBeVisible()
})

test('concurrent account changes converge every tab on the winning cookie session', async ({ page }) => {
  const firstEmail = uniqueEmail('web-e2e-account-a')
  const secondEmail = uniqueEmail('web-e2e-account-b')
  const secondPage = await page.context().newPage()

  await Promise.all([page.goto('/signup'), secondPage.goto('/signup')])
  await fillSignupForm(page, firstEmail)
  await fillSignupForm(secondPage, secondEmail)

  await Promise.all([
    page.getByTestId('signup-submit').click(),
    secondPage.getByTestId('signup-submit').click(),
  ])

  await expect(page).toHaveURL(/\/app$/)
  await expect(secondPage).toHaveURL(/\/app$/)

  const emailOf = async (tab: typeof page) => {
    await tab.goto('/app/profile')
    return tab.getByTestId('profile-email').textContent()
  }
  await expect
    .poll(async () => {
      const first = await emailOf(page)
      const second = await emailOf(secondPage)
      return first !== null && first === second && [firstEmail, secondEmail].includes(first)
    })
    .toBe(true)
})
