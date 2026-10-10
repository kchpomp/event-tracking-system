// The reference rows migrations 20261010100000 and 20261010110000 leave, with their fixed ids:
// companies СИБУР (головной офис), ЗапСибНефтехим, … СибурТюменьГаз and cities Москва, Кстово, Нижневартовск, Тобольск, Пермь, Северск,
// Воронеж, Тольятти, Губкинский, Дзержинск. Tests pick by index, so none of them names a string.
const referenceId = (group: '01' | '02', n: number) =>
  `01990000-0000-7000-8000-00000000${group}${String(n).padStart(2, '0')}`

export const COMPANY_IDS = Array.from({ length: 10 }, (_, index) => referenceId('01', index + 1))
export const CITY_IDS = Array.from({ length: 10 }, (_, index) => referenceId('02', index + 1))
export const COMPANY_ID = COMPANY_IDS[0]!
export const CITY_ID = CITY_IDS[2]! // Нижневартовск
