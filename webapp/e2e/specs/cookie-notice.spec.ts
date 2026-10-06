import { expect, test } from '../helpers/test'

// The config pre-acknowledges the notice for every other spec; this one starts from a clean browser.
test.use({ storageState: { cookies: [], origins: [] } })

test('the cookie notice shows on the first visit, links to the policy and stays gone once read', async ({
  page,
}) => {
  await page.goto('/signup')
  const notice = page.getByTestId('cookie-notice')
  await expect(notice).toBeVisible()

  await notice.getByRole('link', { name: 'Политика конфиденциальности' }).click()
  await expect(page).toHaveURL(/\/privacy$/)
  await expect(page.getByRole('heading', { name: 'ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ' })).toBeVisible()

  await page.getByTestId('cookie-notice-ok').click()
  await expect(notice).toBeHidden()

  await page.goto('/signup')
  await expect(page.getByTestId('signup-submit')).toBeVisible()
  await expect(page.getByTestId('cookie-notice')).toHaveCount(0)
})
