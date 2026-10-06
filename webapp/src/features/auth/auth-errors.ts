import { ApiRequestError } from '@/platform/api'

type AuthAction = 'login' | 'register' | 'reset-request' | 'reset-confirm'

const OFFLINE = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.'
const RATE_LIMITED = 'Слишком много попыток. Подождите немного и повторите.'
const GENERIC = 'Что-то пошло не так. Попробуйте ещё раз.'

/** One Russian sentence per outcome a person can fix; nothing raw from the server is shown. */
export function authErrorMessage(error: unknown, action: AuthAction) {
  // `fetch` rejects with a TypeError when the network is unreachable.
  if (error instanceof TypeError) return OFFLINE
  if (error instanceof ApiRequestError) {
    if (error.status === 429) return RATE_LIMITED
    if (action === 'login' && error.status === 401) return 'Неверный email или пароль.'
    if (action === 'register' && error.status === 409) {
      return 'Пользователь с таким email уже зарегистрирован.'
    }
    if (action === 'reset-confirm' && error.code === 'AUTH_PASSWORD_RESET_INVALID') {
      return 'Ссылка для сброса пароля недействительна или устарела. Запросите новую.'
    }
  }
  return GENERIC
}
