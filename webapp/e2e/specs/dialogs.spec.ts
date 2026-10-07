import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Locator, Page } from '@playwright/test'

import { e2eAdminEmail, e2eAdminPassword } from '../env'
import { expect, logIn, logOut, signUp, test, uniqueEmail } from '../helpers/test'

// Every popup keeps its buttons centred in the footer: a full-width column (main action on top)
// below the `sm` breakpoint (640px), one centred row above it. Screenshots go to
// e2e/.artifacts/dialogs for a visual check.

const outputDirectory = fileURLToPath(new URL('../.artifacts/dialogs/', import.meta.url))
const viewports = { w375: { width: 375, height: 812 }, w768: { width: 768, height: 1024 } } as const
const SM_BREAKPOINT = 640

mkdirSync(outputDirectory, { recursive: true })

async function checkFooter(page: Page, dialog: Locator, name: string, tag: string) {
  await expect(dialog).toBeVisible()
  // Let the zoom-in animation finish: a box measured mid-animation is scaled.
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${outputDirectory}${name}--${tag}.png`, animations: 'disabled' })

  const dialogBox = (await dialog.boundingBox())!
  const footer = dialog.locator('[data-slot$="footer"]')
  const footerBox = (await footer.boundingBox())!
  const boxes = await footer.locator('button').evaluateAll((buttons) =>
    buttons.map((button) => {
      const { x, y, width, height } = button.getBoundingClientRect()
      return { x, y, width, height }
    }),
  )
  expect(boxes.length, `${name}: the footer has buttons`).toBeGreaterThan(0)

  const left = Math.min(...boxes.map((box) => box.x))
  const right = Math.max(...boxes.map((box) => box.x + box.width))
  expect(
    Math.abs((left + right) / 2 - (dialogBox.x + dialogBox.width / 2)),
    `${name}: buttons are centred in the dialog`,
  ).toBeLessThanOrEqual(2)

  const narrow = (page.viewportSize()?.width ?? 0) < SM_BREAKPOINT
  if (narrow) {
    for (const box of boxes) {
      expect(box.width, `${name}: a button spans the footer`).toBeGreaterThanOrEqual(footerBox.width - 1)
    }
    // The main action is last in the markup and sits on top.
    if (boxes.length > 1) expect(boxes.at(-1)!.y).toBeLessThan(boxes[0]!.y)
  } else {
    for (const box of boxes) expect(Math.abs(box.y - boxes[0]!.y), `${name}: one row`).toBeLessThanOrEqual(1)
  }
}

for (const [viewportName, viewport] of Object.entries(viewports)) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test.describe(`${viewportName} ${colorScheme}`, () => {
      test.use({ viewport, colorScheme, contextOptions: { reducedMotion: 'reduce' } })

      test('popup buttons are centred', async ({ page }) => {
        const tag = `${viewportName}-${colorScheme}`

        // Guest: the form notice and the consent text.
        await page.goto('/signup')
        await page.getByTestId('signup-submit').click()
        await checkFooter(page, page.getByRole('alertdialog'), 'signup-notice', tag)
        await page.getByRole('button', { name: 'ОК' }).click()

        await page.getByTestId('consent-link').click()
        await checkFooter(page, page.getByRole('dialog'), 'consent', tag)
        await page.keyboard.press('Escape')

        // Participant: the questions of a «Диффузия» task and the result popup of an idea.
        await signUp(page, uniqueEmail('web-e2e-dialogs'))
        await expect(page).toHaveURL(/\/app$/)

        await page.goto('/app/diffusion')
        await page.getByRole('button', { name: /Найдите участника из другого города/ }).click()
        await expect(page.getByRole('dialog')).toBeVisible()
        await page.waitForTimeout(400)
        await page.screenshot({ path: `${outputDirectory}diffusion-questions--${tag}.png`, animations: 'disabled' })
        await page.keyboard.press('Escape')

        await page.goto('/app/ideas')
        const fields = page.locator('form').locator('input, textarea')
        for (let index = 0; index < 5; index += 1) await fields.nth(index).fill(`Поле ${index + 1}`)
        await page.getByTestId('idea-submit').click()
        await checkFooter(page, page.getByRole('dialog'), 'idea-result', tag)
        await page.getByRole('button', { name: 'ОК' }).click()

        await page.goto('/app/polymer')
        await expect(page.getByRole('heading', { name: 'Пять раундов' })).toBeVisible()
        await page.screenshot({ path: `${outputDirectory}polymer--${tag}.png`, fullPage: true, animations: 'disabled' })
        await page.goto('/app/profile')
        await expect(page.getByTestId('profile-email')).toBeVisible()
        await expect(page.getByText('ID участника')).toHaveCount(0)
        await page.screenshot({ path: `${outputDirectory}profile--${tag}.png`, animations: 'disabled' })

        // Administrator: the role-change confirmation (cancelled, nothing changes).
        await logOut(page)
        await page.goto('/login')
        await logIn(page, e2eAdminEmail, e2eAdminPassword)
        await expect(page).toHaveURL(/\/admin$/)
        await page.goto('/admin/users')
        await page.getByTestId('user-search-input').fill('user@example.com')
        await page.getByTestId('user-search-submit').click()
        await expect(page.getByTestId('user-row')).toHaveCount(1)
        await page.getByTestId('user-row').getByTestId('role-select').click()
        await page.getByTestId('role-option-admin').click()
        await checkFooter(page, page.getByRole('alertdialog'), 'role-change', tag)
        await page.getByRole('button', { name: 'Отмена' }).click()
      })

      test.describe('cookie notice', () => {
        test.use({ storageState: { cookies: [], origins: [] } })

        test('the notice and its policy popup are centred and fit the screen', async ({ page }) => {
          const tag = `${viewportName}-${colorScheme}`
          await page.goto('/signup')
          const notice = page.getByTestId('cookie-notice')
          await expect(notice).toBeVisible()
          await page.waitForTimeout(400)
          await page.screenshot({ path: `${outputDirectory}cookie-notice--${tag}.png`, animations: 'disabled' })

          // The card is centred, its buttons are centred in it, and nothing scrolls sideways.
          const card = (await notice.locator('> div').boundingBox())!
          const screenWidth = page.viewportSize()!.width
          expect(Math.abs(card.x + card.width / 2 - screenWidth / 2), 'the notice is centred').toBeLessThanOrEqual(2)
          const boxes = await notice.locator('button').evaluateAll((buttons) =>
            buttons.map((button) => {
              const { x, width } = button.getBoundingClientRect()
              return { x, width }
            }),
          )
          const left = Math.min(...boxes.map((box) => box.x))
          const right = Math.max(...boxes.map((box) => box.x + box.width))
          expect(Math.abs((left + right) / 2 - (card.x + card.width / 2)), 'its buttons are centred').toBeLessThanOrEqual(2)
          expect(card.x, 'the card stays inside the screen').toBeGreaterThanOrEqual(0)
          expect(card.x + card.width).toBeLessThanOrEqual(screenWidth)
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

          await page.getByTestId('cookie-notice-policy').click()
          await checkFooter(page, page.getByRole('dialog'), 'cookie-policy', tag)
        })
      })
    })
  }
}
