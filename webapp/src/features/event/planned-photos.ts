import { PLANNED_PHOTO_BATCH_MAX } from '@event-tracking-system/contracts'

export const PHOTO_MAX_SIDE = 512
export const PHOTO_STREAMS = 4

const IMAGE_EXTENSION = /\.(jpe?g|png|webp)$/i

export type PhotoFile = { name: string }

export type PhotoReport<T extends PhotoFile> = {
  /** One file for an email in the list. */
  matched: Array<{ email: string; file: T }>
  notListed: T[]
  /** Several files for one email: none of them is sent, the administrator decides which is right. */
  duplicates: T[]
  unsupported: T[]
}

/** `Anna@Example.ru.jpg` -> `anna@example.ru`; null when the extension is not a supported image. */
export function emailFromFileName(name: string) {
  if (!IMAGE_EXTENSION.test(name)) return null
  return name.replace(IMAGE_EXTENSION, '').trim().toLowerCase()
}

export function matchPhotoFiles<T extends PhotoFile>(files: readonly T[], listedEmails: ReadonlySet<string>) {
  const report: PhotoReport<T> = { matched: [], notListed: [], duplicates: [], unsupported: [] }
  const byEmail = new Map<string, T[]>()
  for (const file of files) {
    const email = emailFromFileName(file.name)
    if (email === null) report.unsupported.push(file)
    else byEmail.set(email, [...(byEmail.get(email) ?? []), file])
  }
  for (const [email, group] of byEmail) {
    if (group.length > 1) report.duplicates.push(...group)
    else if (!listedEmails.has(email)) report.notListed.push(group[0]!)
    else report.matched.push({ email, file: group[0]! })
  }
  return report
}

export function chunk<T>(items: readonly T[], size = PLANNED_PHOTO_BATCH_MAX) {
  const batches: T[][] = []
  for (let index = 0; index < items.length; index += size) batches.push(items.slice(index, index + size))
  return batches
}

/** Fits the long side into `max`; never enlarges. */
export function fitSize(width: number, height: number, max = PHOTO_MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** Runs `task` over `items` with at most `limit` in flight; a task must not throw. */
export async function runPool<T>(items: readonly T[], limit: number, task: (item: T) => Promise<void>) {
  let next = 0
  const worker = async () => {
    while (next < items.length) await task(items[next++]!)
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}
