import { readFileSync } from 'node:fs'

import { e2eAdminEmail, e2eAdminPassword } from '../env'
import { expect, logIn, signUp, test, uniqueEmail } from '../helpers/test'

test('an administrator loads participants and hostesses apart and sees who has signed up in each', async ({
  browser,
  page,
}) => {
  const present = uniqueEmail('web-e2e-planned-present')
  const absent = uniqueEmail('web-e2e-planned-absent')
  const hostessAbsent = uniqueEmail('web-e2e-planned-hostess')

  const guestContext = await browser.newContext()
  try {
    const guest = await guestContext.newPage()
    await signUp(guest, present, { firstName: 'Павел', lastName: 'Смирнов' })
    await expect(guest).toHaveURL(/\/app$/)
  } finally {
    await guestContext.close()
  }

  await page.goto('/login')
  await logIn(page, e2eAdminEmail, e2eAdminPassword)
  await expect(page).toHaveURL(/\/admin$/)
  await page.goto('/admin/participants')

  // Participants: pasted lines.
  await page
    .getByTestId('planned-input-participant')
    .fill(`${present}; Павел Смирнов\n${absent}; Дмитрий Ждунов`)
  await page.getByTestId('planned-import-participant').click()
  await expect(page.getByTestId('planned-result-participant')).toContainText('Добавлено: 2')

  // «Не зарегистрировались» is the first filter: only the person who has not signed up is there.
  await expect(page.getByTestId('planned-rows-participant')).toContainText('Дмитрий Ждунов')
  await expect(page.getByTestId('planned-rows-participant')).not.toContainText('Павел Смирнов')
  await page.getByTestId('planned-filter-participant-registered').click()
  await expect(page.getByTestId('planned-rows-participant')).toContainText('Павел Смирнов')

  // Hostesses: a CSV file in the form Russian Excel writes it, into their own list.
  await page.getByTestId('planned-tab-hostess').click()
  await page.getByTestId('planned-file-hostess').setInputFiles({
    name: 'hostesses.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(`\uFEFFEmail;ФИО\r\n${hostessAbsent};Вера Помощникова\r\n`, 'utf-8'),
  })
  await expect(page.getByTestId('planned-input-hostess')).toHaveValue(new RegExp(hostessAbsent))
  await page.getByTestId('planned-import-hostess').click()
  await expect(page.getByTestId('planned-result-hostess')).toContainText('Добавлено: 1')
  await expect(page.getByTestId('planned-rows-hostess')).toContainText('Вера Помощникова')

  // The two lists are counted apart on the Overview, each with its own download of who is missing.
  await page.goto('/admin')
  const participants = page.getByTestId('overview-participant')
  const hostesses = page.getByTestId('overview-hostess')
  await expect(participants.getByTestId('planned-rows-participant')).toContainText('Дмитрий Ждунов')
  await expect(participants).not.toContainText('Вера Помощникова')
  await expect(hostesses.getByTestId('planned-rows-hostess')).toContainText('Вера Помощникова')
  await expect(hostesses).not.toContainText('Дмитрий Ждунов')

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    hostesses.getByTestId('download-hostess').click(),
  ])
  expect(download.suggestedFilename()).toBe('hostesses-not-registered.csv')
  const csv = readFileSync((await download.path())!, 'utf-8')
  expect(csv).toContain('Email;ФИО')
  expect(csv).toContain(`${hostessAbsent};Вера Помощникова`)
  expect(csv).not.toContain('Дмитрий')

  // Tidy up: the planned lists are shared by every spec.
  await page.goto('/admin/participants')
  await page.getByTestId('planned-filter-participant-all').click()
  for (const name of ['Дмитрий Ждунов', 'Павел Смирнов']) {
    await page.getByRole('button', { name: `Убрать из списка: ${name}` }).click()
    await expect(page.getByRole('button', { name: `Убрать из списка: ${name}` })).toHaveCount(0)
  }
  await page.getByTestId('planned-tab-hostess').click()
  await page.getByTestId('planned-filter-hostess-all').click()
  await page.getByRole('button', { name: 'Убрать из списка: Вера Помощникова' }).click()
  await expect(page.getByRole('button', { name: 'Убрать из списка: Вера Помощникова' })).toHaveCount(0)
})

test('a listed hostess registers without a workplace and is given the role with one button', async ({
  browser,
  page,
}) => {
  const email = uniqueEmail('web-e2e-hostess-role')
  const stranger = uniqueEmail('web-e2e-not-listed')

  await page.goto('/login')
  await logIn(page, e2eAdminEmail, e2eAdminPassword)
  await expect(page).toHaveURL(/\/admin$/)
  await page.goto('/admin/participants')
  await page.getByTestId('planned-tab-hostess').click()
  await page.getByTestId('planned-input-hostess').fill(`${email}; Хостесова Ольга`)
  await page.getByTestId('planned-import-hostess').click()
  await expect(page.getByTestId('planned-result-hostess')).toContainText('Добавлено: 1')

  const guestContext = await browser.newContext()
  try {
    // An address that is not listed cannot skip the company and the city.
    const refused = await guestContext.newPage()
    await signUp(refused, stranger, { hostess: true })
    await expect(refused.getByText('Этого адреса нет в списке хостесс')).toBeVisible()

    // The listed one signs up with the name from the list, and no workplace.
    const guest = await guestContext.newPage()
    await signUp(guest, email, { hostess: true, firstName: 'Ольга', lastName: 'Хостесова' })
    await expect(guest).toHaveURL(/\/app$/)
  } finally {
    await guestContext.close()
  }

  // She is in the queue, and one confirmed click gives her the role.
  await page.reload()
  await page.getByTestId('planned-tab-hostess').click()
  const queue = page.getByTestId('hostess-ready')
  await expect(queue).toContainText('Ольга Хостесова')
  await queue.getByTestId('make-hostess').click()
  await expect(page.getByRole('alertdialog')).toContainText('баллы')
  await page.getByTestId('make-hostess-confirm').click()
  await expect(page.getByTestId('hostess-ready')).toHaveCount(0)

  await page.getByTestId('planned-filter-hostess-registered').click()
  await expect(page.getByTestId('planned-rows-hostess')).toContainText('Зарегистрирована, роль назначена')

  // Tidy up.
  await page.getByTestId('planned-filter-hostess-all').click()
  await page.getByRole('button', { name: 'Убрать из списка: Хостесова Ольга' }).click()
  await expect(page.getByRole('button', { name: 'Убрать из списка: Хостесова Ольга' })).toHaveCount(0)
})
