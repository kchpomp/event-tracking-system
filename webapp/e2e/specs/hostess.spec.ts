import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { e2eAdminEmail, e2eAdminPassword } from '../env'
import { expect, expectCentredContent, logIn, signUp, test, uniqueEmail } from '../helpers/test'

// Hostesses work from a phone, so the whole journey runs at phone width; the screenshots are for
// a visual review in e2e/.artifacts/hostess.
const shots = fileURLToPath(new URL('../.artifacts/hostess/', import.meta.url))
mkdirSync(shots, { recursive: true })
test.use({ viewport: { width: 375, height: 812 } })

test('an administrator makes a hostess, who finds a participant, awards a station and shows the sign-up QR', async ({
  browser,
  page,
}) => {
  const hostessEmail = uniqueEmail('web-e2e-hostess')
  const participantEmail = uniqueEmail('web-e2e-lost-points')
  // A surname nobody else in the shared test database has, so the search finds exactly one person.
  const surname = `Потеряева${Math.random().toString(36).slice(2, 8)}`

  const participantContext = await browser.newContext()
  const participantPage = await participantContext.newPage()
  await signUp(participantPage, participantEmail, { firstName: 'Мария', lastName: surname })
  await expect(participantPage).toHaveURL(/\/app$/)
  await expect(participantPage.getByTestId('total-points')).toHaveText('0')

  // The future hostess registers as everyone does.
  await signUp(page, hostessEmail, { firstName: 'Ольга', lastName: 'Хостесова' })
  await expect(page).toHaveURL(/\/app$/)

  // An administrator gives her the role on the users page.
  const adminContext = await browser.newContext()
  const adminPage = await adminContext.newPage()
  await adminPage.goto('/login')
  await logIn(adminPage, e2eAdminEmail, e2eAdminPassword)
  await expect(adminPage).toHaveURL(/\/admin$/)
  // The sidebar is collapsed at phone width, so go to the page directly.
  await adminPage.goto('/admin/users')
  await adminPage.getByTestId('user-search-input').fill(hostessEmail)
  await adminPage.getByTestId('user-search-submit').click()
  await expect(adminPage.getByTestId('user-row')).toHaveCount(1)
  await adminPage.getByTestId('user-row').getByTestId('role-select').click()
  await adminPage.getByTestId('role-option-hostess').click()
  await adminPage.getByTestId('role-change-confirm').click()
  await expect(adminPage.getByTestId('role-change-success')).toContainText('хостес')

  // Her old session ended; she signs in again and lands on the hostess desk, without a profile.
  await page.reload()
  await expect(page.getByTestId('login-form')).toBeVisible()
  await logIn(page, hostessEmail)
  await expect(page).toHaveURL(/\/hostess$/)
  await expect(page.getByTestId('nav-profile')).toHaveCount(0)

  // She finds the participant by surname and awards the station whose points were lost.
  await page.getByTestId('hostess-search').fill(surname)
  await expect(page.getByTestId('hostess-result')).toBeVisible()
  await page.screenshot({ path: `${shots}home-search.png`, animations: 'disabled' })
  await page.getByTestId('hostess-result').click()
  await expect(page.getByTestId('hostess-participant-name')).toHaveText(`Мария ${surname}`)
  await page.screenshot({ path: `${shots}participant.png`, fullPage: true, animations: 'disabled' })
  const workshop = page.getByTestId('hostess-station').filter({ hasText: 'Воркшоп 1' })
  await workshop.click()
  await expect(page.getByTestId('hostess-award-confirm')).toBeVisible()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${shots}confirm.png`, animations: 'disabled' })
  // The confirmation is centred: title, text and both buttons.
  const confirmation = page.getByRole('alertdialog')
  await expectCentredContent(confirmation, 'award confirmation')
  const buttons = await confirmation.getByRole('button').evaluateAll((nodes) =>
    nodes.map((node) => {
      const { x, width } = node.getBoundingClientRect()
      return { x, width }
    }),
  )
  const card = (await confirmation.boundingBox())!
  const left = Math.min(...buttons.map((button) => button.x))
  const right = Math.max(...buttons.map((button) => button.x + button.width))
  expect(Math.abs((left + right) / 2 - (card.x + card.width / 2)), 'award buttons are centred').toBeLessThanOrEqual(2)
  await page.getByTestId('hostess-award-confirm').click()
  await expect(page.getByText('Баллы начислены')).toBeVisible()
  await page.waitForTimeout(400)
  await expectCentredContent(page.getByRole('dialog'), 'award result')
  await page.screenshot({ path: `${shots}awarded.png`, animations: 'disabled' })
  await page.getByRole('button', { name: 'ОК' }).click()
  await expect(workshop).toBeDisabled()

  // The participant sees the point; the same station cannot be awarded twice.
  await participantPage.reload()
  await expect(participantPage.getByTestId('total-points')).toHaveText('1')

  // To help someone register she shows the sign-up page as a QR code.
  await page.goto('/hostess')
  await page.getByTestId('hostess-signup-qr-toggle').click()
  await expect(page.getByTestId('hostess-signup-qr')).toBeVisible()
  await page.screenshot({ path: `${shots}signup-qr.png`, fullPage: true, animations: 'disabled' })

  // The workspaces stay apart: a participant cannot open the desk, a hostess has no game.
  await participantPage.goto('/hostess')
  await expect(participantPage).toHaveURL(/\/app$/)
  await page.goto('/app')
  await expect(page).toHaveURL(/\/hostess$/)

  await adminContext.close()
  await participantContext.close()
})
