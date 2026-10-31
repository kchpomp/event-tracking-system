import { e2eAdminEmail, e2eAdminPassword } from '../env'
import { expect, logIn, markEmailVerified, signUp, test, uniqueEmail } from '../helpers/test'

test('the display account signs out from its menu and from a running visualization', async ({ browser, page }) => {
  const email = uniqueEmail('web-e2e-screen')
  await signUp(page, email, { firstName: 'Экран', lastName: 'Зальный' })
  await expect(page).toHaveURL(/\/app$/)
  markEmailVerified(email)

  const adminContext = await browser.newContext()
  const adminPage = await adminContext.newPage()
  await adminPage.goto('/login')
  await logIn(adminPage, e2eAdminEmail, e2eAdminPassword)
  await expect(adminPage).toHaveURL(/\/admin$/)
  await adminPage.goto('/admin/users')
  await adminPage.getByTestId('user-search-input').fill(email)
  await adminPage.getByTestId('user-search-submit').click()
  await expect(adminPage.getByTestId('user-row')).toHaveCount(1)
  await adminPage.getByTestId('user-row').getByTestId('role-select').click()
  await adminPage.getByTestId('role-option-screen').click()
  await adminPage.getByTestId('role-change-confirm').click()
  await expect(adminPage.getByTestId('role-change-success')).toBeVisible()

  // The old session ended with the role change; the display account signs in again.
  await page.reload()
  await expect(page.getByTestId('login-form')).toBeVisible()
  await logIn(page, email)
  await expect(page).toHaveURL(/\/screen$/)

  // From the menu: the button signs out and the sign-in form comes back.
  await page.getByTestId('logout').click()
  await expect(page.getByTestId('login-form')).toBeVisible()

  // From a visualization: the small control does the same.
  await logIn(page, email)
  await expect(page).toHaveURL(/\/screen$/)
  await page.getByTestId('screen-choice-flask').click()
  await expect(page).toHaveURL(/\/screen\/flask$/)
  await page.getByTestId('logout').click()
  await expect(page.getByTestId('login-form')).toBeVisible()
})
