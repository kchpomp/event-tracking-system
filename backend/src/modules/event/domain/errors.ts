export type EventFailureKind =
  | 'invalid_station_token'
  | 'station_inactive'
  | 'event_inactive'
  | 'invalid_participant_token'
  | 'self_connection'
  | 'same_city_and_company'
  | 'team_empty'
  | 'not_found'
  | 'invalid_schedule'
  | 'badge_not_eligible'
  | 'badge_issued'

export class EventFailure extends Error {
  constructor(
    public readonly kind: EventFailureKind,
    message: string,
  ) {
    super(message)
  }
}
