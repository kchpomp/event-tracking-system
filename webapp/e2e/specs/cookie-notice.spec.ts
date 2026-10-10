import { expect, test } from '../helpers/test'

// The config pre-acknowledges the notice for every other spec; this one starts from a clean browser.
test.use({ storageState: { cookies: [], origins: [] } })

test('«Понятно» clears the notice for good', async ({ page }) => {
  await page.goto('/signup')
  const notice = page.getByTestId('cookie-notice')
  await expect(notice).toBeVisible()

  await page.getByTestId('cookie-notice-ok').click()
  await expect(notice).toBeHidden()

  await page.reload()
  await expect(page.getByTestId('signup-submit')).toBeVisible()
  await expect(page.getByTestId('cookie-notice')).toHaveCount(0)
})

test("the policy is a link to the operator's own document, in the notice and under the form", async ({
  page,
}) => {
  await page.goto('/login')

  // Not a popup and not an app page: a link that opens the published PDF in a new tab.
  const noticeLink = page.getByTestId('cookie-notice-policy')
  await expect(noticeLink).toHaveAttribute('href', /sibur\.ru\/upload\/documents\/politiki-docs\//)
  await expect(noticeLink).toHaveAttribute('target', '_blank')

  const footerLink = page.getByRole('link', { name: /Политика СИБУР в отношении обработки/ })
  await expect(footerLink).toHaveAttribute('href', /\.pdf$/)

  // The app has no policy page of its own any more.
  await page.goto('/privacy')
  await expect(page.getByText('Страница не найдена')).toBeVisible()
})
