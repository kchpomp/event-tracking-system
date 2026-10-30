import { ApiRequestError } from '@/platform/api'

type AuthAction =
  | 'login'
  | 'register'
  | 'reset-request'
  | 'reset-confirm'
  | 'verify-request'
  | 'verify-confirm'

const OFFLINE = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.'
const RATE_LIMITED = 'Слишком много попыток. Подождите немного и повторите.'
const GENERIC = 'Что-то пошло не так. Попробуйте ещё раз.'

/** One Russian sentence per outcome a person can fix; nothing raw from the server is shown. */
export function authErrorMessage(error: unknown, action: AuthAction) {
  // `fetch` rejects with a TypeError when the network is unreachable.
  if (error instanceof TypeError) return OFFLINE
  if (error instanceof ApiRequestError) {
    if (error.code === 'AUTH_LOGIN_LOCKED') {
      return 'Слишком много неудачных попыток входа. Попробуйте через 15 минут или восстановите пароль.'
    }
    if (error.status === 429) return RATE_LIMITED
    if (action === 'login' && error.status === 401) return 'Неверный email или пароль.'
    if (action === 'register' && error.code === 'REGISTRATION_CLOSED') {
      return 'Регистрация закрыта: новые участники сейчас не принимаются.'
    }
    if (action === 'register' && error.status === 409) {
      return 'Пользователь с таким email уже зарегистрирован.'
    }
    if (action === 'reset-confirm' && error.code === 'AUTH_PASSWORD_RESET_INVALID') {
      return 'Ссылка для сброса пароля недействительна или устарела. Запросите новую.'
    }
    if (action === 'verify-confirm' && error.code === 'AUTH_EMAIL_VERIFICATION_INVALID') {
      return 'Ссылка для подтверждения недействительна или устарела. Запросите новую в профиле.'
    }
  }
  return GENERIC
}
