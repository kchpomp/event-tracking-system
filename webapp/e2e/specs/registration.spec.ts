import { e2eAdminEmail, e2eAdminPassword } from '../env'
import { expect, logIn, test } from '../helpers/test'

test('an administrator closes sign-ups: the sign-up page says so, and reopening brings the form back', async ({
  browser,
  page,
}) => {
  await page.goto('/login')
  await logIn(page, e2eAdminEmail, e2eAdminPassword)
  await expect(page).toHaveURL(/\/admin$/)
  await page.goto('/admin/stations')
  const toggle = page.getByTestId('registration-switch')
  await expect(toggle).toBeChecked()

  const guestContext = await browser.newContext()
  try {
    await toggle.click()
    await expect(toggle).not.toBeChecked()

    const guest = await guestContext.newPage()
    await guest.goto('/signup')
    await expect(guest.getByTestId('registration-closed')).toBeVisible()
    await expect(guest.getByTestId('signup-submit')).toHaveCount(0)

    await toggle.click()
    await expect(toggle).toBeChecked()
    await guest.reload()
    await expect(guest.getByTestId('signup-submit')).toBeVisible()
  } finally {
    // Never leave sign-ups closed for the specs that follow.
    if (!(await toggle.isChecked())) await toggle.click()
    await guestContext.close()
  }
})
