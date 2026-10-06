import { AppError } from '../../../http/errors'
import { EventFailure } from '../domain/errors'

export function toEventAppError(error: unknown) {
  if (!(error instanceof EventFailure)) return error

  switch (error.kind) {
    case 'invalid_station_token':
      return new AppError(404, 'EVENT_INVALID_STATION_TOKEN', error.message)
    case 'station_inactive':
      return new AppError(409, 'EVENT_STATION_INACTIVE', error.message)
    case 'event_inactive':
      return new AppError(409, 'EVENT_NOT_ACTIVE', error.message)
    case 'invalid_participant_token':
      return new AppError(404, 'DIFFUSION_INVALID_PARTICIPANT_TOKEN', error.message)
    case 'self_connection':
      return new AppError(409, 'DIFFUSION_SELF', error.message)
    case 'same_city_and_company':
      return new AppError(409, 'DIFFUSION_SAME_CITY_AND_COMPANY', error.message)
    case 'not_found':
      return new AppError(404, 'NOT_FOUND', error.message)
  }
}

export async function executeEvent<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    throw toEventAppError(error)
  }
}
