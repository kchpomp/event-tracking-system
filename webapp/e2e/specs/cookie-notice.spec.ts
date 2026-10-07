import { expect, test } from '../helpers/test'

// The config pre-acknowledges the notice for every other spec; this one starts from a clean browser.
test.use({ storageState: { cookies: [], origins: [] } })

test('the cookie notice opens the policy in a popup: «Закрыть» keeps the notice, «Согласен» clears it for good', async ({
  page,
}) => {
  await page.goto('/signup')
  const notice = page.getByTestId('cookie-notice')
  await expect(notice).toBeVisible()

  // «Закрыть» only closes the popup.
  await page.getByTestId('cookie-notice-policy').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByTestId('cookie-policy-close').click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(notice).toBeVisible()

  // «Согласен» works only after the text is read to the end, then clears the notice.
  await page.getByTestId('cookie-notice-policy').click()
  await expect(page.getByTestId('cookie-policy-agree')).toBeDisabled()
  await page.getByRole('dialog').locator('div.overflow-y-auto').evaluate((element) => {
    element.scrollTo(0, element.scrollHeight)
  })
  await page.getByTestId('cookie-policy-agree').click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(notice).toBeHidden()

  await page.reload()
  await expect(page.getByTestId('signup-submit')).toBeVisible()
  await expect(page.getByTestId('cookie-notice')).toHaveCount(0)
})

test('«Понятно» clears the notice, and the policy stays reachable on its own page', async ({ page }) => {
  await page.goto('/login')
  await page.getByTestId('cookie-notice-ok').click()
  await expect(page.getByTestId('cookie-notice')).toBeHidden()

  await page.getByRole('link', { name: 'Политика конфиденциальности' }).click()
  await expect(page).toHaveURL(/\/privacy$/)
  await expect(page.getByRole('heading', { name: 'ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ' })).toBeVisible()
})
