import type { PictogramName } from './station-icons'

// Station pictograms are matched by station name; a station the organizers add later gets «station».
const STATION_PICTOGRAM: Record<string, PictogramName> = {
  'Точка соединения': 'connection',
  'Люди формулы будущего': 'people',
  'Воркшоп 1': 'workshop1',
  'Воркшоп 2': 'workshop2',
  'Воркшоп 3': 'workshop3',
  'Полимер решений': 'polymer',
}

export function pictogramFor(stationName: string): PictogramName {
  return STATION_PICTOGRAM[stationName] ?? 'station'
}
