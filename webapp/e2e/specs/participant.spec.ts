import type { APIRequestContext } from '@playwright/test'

import { e2eAdminEmail, e2eAdminPassword } from '../env'
import {
  accessTokenOf,
  e2ePassword,
  expect,
  fillSignupForm,
  logIn,
  signUp,
  test,
  uniqueEmail,
} from '../helpers/test'

const backendUrl = () => process.env.E2E_BACKEND_URL ?? ''
const origin = () => process.env.E2E_WEB_URL ?? ''

async function adminToken(request: APIRequestContext) {
  const response = await request.post(`${backendUrl()}/api/auth/login`, {
    data: { email: e2eAdminEmail, password: e2eAdminPassword },
    headers: { Origin: origin() },
  })
  expect(response.ok()).toBe(true)
  return ((await response.json()) as { accessToken: string }).accessToken
}

function bearer(token: string) {
  return { Authorization: `Bearer ${token}`, Origin: origin() }
}

async function stationToken(request: APIRequestContext, name: string) {
  const response = await request.get(`${backendUrl()}/api/admin/stations`, {
    headers: bearer(await adminToken(request)),
  })
  const { stations } = (await response.json()) as { stations: { name: string; qrToken: string }[] }
  return stations.find((station) => station.name === name)!.qrToken
}

// The camera cannot run in a test, so the scans go through the API with the participant's own
// token, exactly as the scanner screen would send them.
async function registerOther(request: APIRequestContext, cityName: string) {
  const reference = await request.get(`${backendUrl()}/api/registration/reference`)
  const lists = (await reference.json()) as {
    companies: { id: string; name: string }[]
    cities: { id: string; name: string }[]
  }
  const response = await request.post(`${backendUrl()}/api/auth/register`, {
    data: {
      email: uniqueEmail('web-e2e-other'),
      password: e2ePassword,
      firstName: 'Олег',
      lastName: 'Иванов',
      companyId: lists.companies[1]!.id,
      cityId: lists.cities.find((city) => city.name === cityName)!.id,
      consent: true,
    },
    headers: { Origin: origin() },
  })
  expect(response.status()).toBe(201)
  const { accessToken } = (await response.json()) as { accessToken: string }
  const me = await request.get(`${backendUrl()}/api/event/me`, { headers: bearer(accessToken) })
  const { profile } = (await me.json()) as { profile: { personalQrToken: string } }
  return profile.personalQrToken
}

test('the registration form checks required fields, then the consent, then registers', async ({ page }) => {
  await page.goto('/signup')

  // 1. Nothing filled: the first popup, with the product's exact wording.
  await page.getByTestId('signup-submit').click()
  await expect(page.getByTestId('signup-notice')).toHaveText('Не все обязательные поля заполнены')
  await page.getByRole('button', { name: 'ОК' }).click()

  // 2. Everything filled but the consent: the second popup.
  await fillSignupForm(page, uniqueEmail('web-e2e-form'), { consent: false })
  await page.getByTestId('signup-submit').click()
  await expect(page.getByTestId('signup-notice')).toHaveText(
    'Не получено соглашение на обработку персональных данных',
  )
  await page.getByRole('button', { name: 'ОК' }).click()

  // 3. The consent text must be read to the end before «Согласен» works.
  await page.getByTestId('consent-link').click()
  await expect(page.getByTestId('consent-agree')).toBeDisabled()
  await page.getByRole('dialog').locator('div.overflow-y-auto').evaluate((element) => {
    element.scrollTo(0, element.scrollHeight)
  })
  await expect(page.getByTestId('consent-agree')).toBeEnabled()
  await page.getByTestId('consent-agree').click()
  await expect(page.getByTestId('signup-consent')).toBeChecked()

  // 4. The policy is a link to the operator's published document, not a popup or a second tick.
  await expect(page.getByTestId('privacy-policy-link')).toHaveAttribute('href', /sibur\.ru\/upload\//)

  await page.getByTestId('signup-submit').click()
  await expect(page).toHaveURL(/\/app$/)
  await expect(page.getByTestId('total-points')).toHaveText('0')
})

test('a participant registers, scores at stations, connects, shares an idea and sees the ranking', async ({
  page,
  playwright,
}) => {
  const email = uniqueEmail('web-e2e-participant')
  await signUp(page, email, { firstName: 'Мария', lastName: 'Сидорова', city: 'Нижневартовск', company: 'СИБУР (головной офис)' })
  await expect(page).toHaveURL(/\/app$/)
  await expect(page.getByTestId('total-points')).toHaveText('0')

  // The session survives a reload (only the refresh cookie can restore it).
  await page.reload()
  await expect(page.getByTestId('total-points')).toHaveText('0')

  const api = await playwright.request.newContext()
  try {
    const token = await accessTokenOf(page)

    // A station scores once.
    const workshop = await stationToken(api, 'Воркшоп 1')
    const scan = () =>
      api.post(`${backendUrl()}/api/event/scan`, { data: { token: workshop }, headers: bearer(token) })
    expect(await (await scan()).json()).toMatchObject({ pointsAwarded: 1, totalPoints: 1 })
    expect(await (await scan()).json()).toMatchObject({ pointsAwarded: 0, alreadyCompleted: true })

    // A connection with someone from another city and company.
    const other = await registerOther(api, 'Пермь')
    const connect = await api.post(`${backendUrl()}/api/event/diffusion/connections`, {
      data: { token: other },
      headers: bearer(token),
    })
    expect(await connect.json()).toEqual({ connectionsCount: 1, alreadyConnected: false })

    await page.reload()
    await expect(page.getByTestId('total-points')).toHaveText('2')
    const myRow = page.getByTestId('board-row').filter({ hasText: '(вы)' })
    await expect(myRow).toContainText('Мария Сидорова')
    await expect(myRow).toContainText('2')

    // The «Диффузия» page shows the progress and the participant's own QR.
    await page.getByRole('link', { name: /Диффузия/ }).click()
    await expect(page).toHaveURL(/\/app\/diffusion$/)
    await expect(page.getByText('1 из 3').first()).toBeVisible()
    await page.getByRole('button', { name: 'Показать мой QR' }).click()
    await expect(page.getByTestId('my-qr')).toBeVisible()

    // An idea through the form earns a point, then the page returns to the dashboard.
    await page.goto('/app/ideas')
    const form = page.locator('form')
    for (const [index, text] of ['Название', 'Направление', 'Проблема', 'Описание', 'Эффект'].entries()) {
      await form.locator('input, textarea').nth(index).fill(`${text} идеи`)
    }
    await page.getByTestId('idea-submit').click()
    await expect(page.getByText('Идея принята и добавлена в Банк идей.')).toBeVisible()
    await page.getByRole('button', { name: 'ОК' }).click()
    await expect(page).toHaveURL(/\/app$/)
    await expect(page.getByTestId('total-points')).toHaveText('3')

    // The profile is read-only and shows the registered data.
    await page.getByTestId('nav-profile').click()
    await expect(page.getByTestId('profile-firstName')).toHaveText('Мария')
    await expect(page.getByTestId('profile-city')).toHaveText('Нижневартовск')
    await expect(page.getByTestId('profile-email')).toHaveText(email)
  } finally {
    await api.dispose()
  }
})

test('an administrator prints the station codes and can close the event', async ({ browser, page, playwright }) => {
  await page.goto('/login')
  await logIn(page, e2eAdminEmail, e2eAdminPassword)
  await expect(page).toHaveURL(/\/admin$/)
  await page.goto('/admin/stations')
  await expect(page.getByRole('heading', { name: 'Станции' })).toBeVisible()
  await expect(page.getByAltText('QR-код станции')).toHaveCount(15)
  await expect(page.getByText('Полимер решений: место 1', { exact: true })).toBeVisible()

  const api = await playwright.request.newContext()
  const participantContext = await browser.newContext()
  try {
    const participant = await participantContext.newPage()
    await signUp(participant, uniqueEmail('web-e2e-closed'))
    await expect(participant).toHaveURL(/\/app$/)
    const token = await accessTokenOf(participant)
    const workshop = await stationToken(api, 'Воркшоп 2')
    const scan = () =>
      api.post(`${backendUrl()}/api/event/scan`, { data: { token: workshop }, headers: bearer(token) })

    await page.getByRole('switch', { name: 'Сканирование идёт' }).click()
    await expect(page.getByText('Мероприятие закрыто')).toBeVisible()
    expect((await scan()).status()).toBe(409)

    await page.getByRole('switch', { name: 'Сканирование идёт' }).click()
    await expect(page.getByText('Участники получают баллы за сканирование.')).toBeVisible()
    expect((await scan()).status()).toBe(200)
  } finally {
    await participantContext.close()
    await api.dispose()
  }
})
