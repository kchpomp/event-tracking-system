export type EventFailureKind =
  | 'invalid_station_token'
  | 'station_inactive'
  | 'event_inactive'
  | 'invalid_participant_token'
  | 'self_connection'
  | 'same_city_and_company'
  | 'not_found'

export class EventFailure extends Error {
  constructor(
    public readonly kind: EventFailureKind,
    message: string,
  ) {
    super(message)
  }
}
