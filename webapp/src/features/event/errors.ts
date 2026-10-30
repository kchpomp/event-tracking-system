import { ApiRequestError } from '@/platform/api'

// The backend answers with a stable code per refusal; each one gets its own Russian sentence, and
// anything not listed here becomes ONE generic line, so nothing raw is ever shown to a participant.
const MESSAGES: Record<string, string> = {
  EVENT_INVALID_STATION_TOKEN: 'Этот QR-код не относится ни к одной станции. Попробуйте ещё раз.',
  EVENT_STATION_INACTIVE: 'Эта станция сейчас неактивна.',
  EVENT_NOT_ACTIVE: 'Мероприятие сейчас не проходит.',
  DIFFUSION_INVALID_PARTICIPANT_TOKEN:
    'Это не QR-код участника. Попросите собеседника нажать «Показать мой QR».',
  DIFFUSION_SELF: 'Нельзя создать связь с самим собой.',
  DIFFUSION_SAME_CITY_AND_COMPANY: 'Нужен участник из другого города или с другого предприятия.',
  NOT_FOUND: 'Участник или станция не найдены. Обновите страницу и попробуйте ещё раз.',
  EVENT_TEAM_EMPTY: 'В команде пока нет участников: начислять некому.',
  FORBIDDEN: 'Для этого действия нужна роль хостес.',
  UNAUTHORIZED: 'Войдите в аккаунт и повторите попытку.',
  RATE_LIMITED: 'Слишком много попыток. Подождите немного и повторите.',
}

export const GENERIC_ERROR = 'Что-то пошло не так. Попробуйте ещё раз.'
export const OFFLINE_ERROR = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.'

export function eventErrorMessage(error: unknown) {
  // `fetch` rejects with a TypeError when the network is unreachable.
  if (error instanceof TypeError) return OFFLINE_ERROR
  if (error instanceof ApiRequestError) {
    return MESSAGES[error.code] ?? (error.status === 429 ? MESSAGES.RATE_LIMITED : GENERIC_ERROR)
  }
  return GENERIC_ERROR
}

/** A refused list import is a 400 with a Russian sentence about the exact cell: shown as it is. */
export function importErrorMessage(error: unknown) {
  if (error instanceof ApiRequestError && error.status === 400 && error.code === 'VALIDATION_ERROR' && error.message) {
    return error.message
  }
  return eventErrorMessage(error)
}

/** Awarding a team: a missing team is 404 (the generic text speaks of a participant or a station). */
export function teamAwardErrorMessage(error: unknown) {
  if (error instanceof ApiRequestError && error.status === 404) {
    return 'Такой команды нет. Обновите список и выберите команду заново.'
  }
  return eventErrorMessage(error)
}

/** A refused slot is a 400 whose message names the problem for the administrator: shown as it is. */
export function scheduleErrorMessage(error: unknown) {
  if (error instanceof ApiRequestError && error.status === 400 && error.code === 'VALIDATION_ERROR' && error.message) {
    return error.message
  }
  return eventErrorMessage(error)
}

/** The badge refusals are 409s whose message is written for the screen: shown as the server says it. */
export function badgeErrorMessage(error: unknown) {
  if (
    error instanceof ApiRequestError &&
    error.status === 409 &&
    (error.code === 'BADGE_NOT_ELIGIBLE' || error.code === 'BADGE_ALREADY_ISSUED') &&
    error.message
  ) {
    return error.message
  }
  return eventErrorMessage(error)
}
