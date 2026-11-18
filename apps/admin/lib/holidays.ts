/**
 * Feriados que a agenda conhece. Nada é fechado automaticamente: cada data vira uma pergunta
 * ("vai abrir?") e a resposta é gravada como data especial (schedule_overrides).
 *
 * Cobertura: nacionais (lei federal), pontos facultativos mais comuns, estaduais das 27 UFs e
 * municipais das capitais. Outros municípios ficam para a gestora marcar em "Datas especiais"
 * até existir uma fonte oficial por código IBGE (ver docs/technical-debt).
 */

export type HolidayScope = 'national' | 'optional' | 'state' | 'municipal'
export type Holiday = { date: string; name: string; scope: HolidayScope }

type Fixed = [month: number, day: number, name: string]

const national: Fixed[] = [
  [1, 1, 'Confraternização Universal'],
  [4, 21, 'Tiradentes'],
  [5, 1, 'Dia do Trabalho'],
  [9, 7, 'Independência do Brasil'],
  [10, 12, 'Nossa Senhora Aparecida'],
  [11, 2, 'Finados'],
  [11, 15, 'Proclamação da República'],
  [11, 20, 'Dia da Consciência Negra'],
  [12, 25, 'Natal'],
]

/** Days many spaces close or shorten even without a law: worth asking too. */
const optional: Fixed[] = [
  [12, 24, 'Véspera de Natal'],
  [12, 31, 'Véspera de Ano-Novo'],
]

const states: Record<string, Fixed[]> = {
  AC: [
    [1, 23, 'Dia do Evangélico'],
    [6, 15, 'Aniversário do Acre'],
    [8, 6, 'Revolução Acreana'],
    [9, 5, 'Dia da Amazônia'],
    [11, 17, 'Tratado de Petrópolis'],
  ],
  AL: [
    [6, 24, 'São João'],
    [6, 29, 'São Pedro'],
    [9, 16, 'Emancipação Política de Alagoas'],
    [11, 30, 'Dia do Evangélico'],
  ],
  AM: [[9, 5, 'Elevação do Amazonas à Província']],
  AP: [
    [3, 19, 'São José'],
    [9, 13, 'Criação do Território do Amapá'],
  ],
  BA: [[7, 2, 'Independência da Bahia']],
  CE: [
    [3, 19, 'São José'],
    [3, 25, 'Data Magna do Ceará'],
  ],
  DF: [[11, 30, 'Dia do Evangélico']],
  ES: [],
  GO: [],
  MA: [[7, 28, 'Adesão do Maranhão à Independência']],
  MG: [],
  MS: [[10, 11, 'Criação do Estado de Mato Grosso do Sul']],
  MT: [],
  PA: [[8, 15, 'Adesão do Grão-Pará à Independência']],
  PB: [[8, 5, 'Fundação da Paraíba']],
  PE: [[3, 6, 'Data Magna de Pernambuco']],
  PI: [
    [3, 13, 'Batalha do Jenipapo'],
    [10, 19, 'Dia do Piauí'],
  ],
  PR: [[12, 19, 'Emancipação Política do Paraná']],
  RJ: [[4, 23, 'São Jorge']],
  RN: [[10, 3, 'Mártires de Cunhaú e Uruaçu']],
  RO: [
    [1, 4, 'Criação do Estado de Rondônia'],
    [6, 18, 'Dia do Evangélico'],
  ],
  RR: [[10, 5, 'Criação de Roraima']],
  RS: [[9, 20, 'Revolução Farroupilha']],
  SC: [],
  SE: [[7, 8, 'Emancipação Política de Sergipe']],
  SP: [[7, 9, 'Revolução Constitucionalista']],
  TO: [
    [3, 18, 'Autonomia do Tocantins'],
    [9, 8, 'Nossa Senhora da Natividade'],
    [10, 5, 'Criação do Tocantins'],
  ],
}

/** Capitals, keyed by "UF:cidade normalizada". `corpusChristi` = also a municipal holiday. */
const capitals: Record<string, { days: Fixed[]; corpusChristi?: boolean }> = {
  'AC:rio branco': { days: [[12, 28, 'Aniversário de Rio Branco']] },
  'AL:maceio': { days: [[8, 27, 'Nossa Senhora dos Prazeres']] },
  'AM:manaus': {
    days: [
      [10, 24, 'Aniversário de Manaus'],
      [12, 8, 'Nossa Senhora da Conceição'],
    ],
  },
  'AP:macapa': { days: [[2, 4, 'Aniversário de Macapá']] },
  'BA:salvador': {
    days: [
      [6, 24, 'São João'],
      [12, 8, 'Nossa Senhora da Conceição da Praia'],
    ],
  },
  'CE:fortaleza': { days: [[8, 15, 'Nossa Senhora da Assunção']] },
  'DF:brasilia': { days: [] },
  'ES:vitoria': { days: [[9, 8, 'Nossa Senhora da Vitória']] },
  'GO:goiania': {
    days: [
      [5, 24, 'Nossa Senhora Auxiliadora'],
      [10, 24, 'Aniversário de Goiânia'],
    ],
  },
  'MA:sao luis': { days: [[9, 8, 'Aniversário de São Luís']] },
  'MG:belo horizonte': {
    days: [
      [8, 15, 'Assunção de Nossa Senhora'],
      [12, 8, 'Imaculada Conceição'],
    ],
    corpusChristi: true,
  },
  'MS:campo grande': { days: [[8, 26, 'Aniversário de Campo Grande']] },
  'MT:cuiaba': { days: [[4, 8, 'Aniversário de Cuiabá']] },
  'PA:belem': {
    days: [
      [1, 12, 'Aniversário de Belém'],
      [12, 8, 'Nossa Senhora da Conceição'],
    ],
  },
  'PB:joao pessoa': { days: [] },
  'PE:recife': {
    days: [
      [6, 24, 'São João'],
      [7, 16, 'Nossa Senhora do Carmo'],
      [12, 8, 'Nossa Senhora da Conceição'],
    ],
  },
  'PI:teresina': { days: [[8, 16, 'Aniversário de Teresina']] },
  'PR:curitiba': { days: [[9, 8, 'Nossa Senhora da Luz dos Pinhais']], corpusChristi: true },
  'RJ:rio de janeiro': { days: [[1, 20, 'São Sebastião']] },
  'RN:natal': {
    days: [
      [1, 6, 'Santos Reis'],
      [11, 21, 'Nossa Senhora da Apresentação'],
    ],
  },
  'RO:porto velho': { days: [[10, 2, 'Aniversário de Porto Velho']] },
  'RR:boa vista': { days: [[7, 9, 'Aniversário de Boa Vista']] },
  'RS:porto alegre': { days: [[2, 2, 'Nossa Senhora dos Navegantes']], corpusChristi: true },
  'SC:florianopolis': { days: [[3, 23, 'Aniversário de Florianópolis']] },
  'SE:aracaju': {
    days: [
      [3, 17, 'Aniversário de Aracaju'],
      [12, 8, 'Nossa Senhora da Conceição'],
    ],
  },
  'SP:sao paulo': { days: [[1, 25, 'Aniversário de São Paulo']], corpusChristi: true },
  'TO:palmas': { days: [[5, 20, 'Aniversário de Palmas']] },
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function iso(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
export function easter(year: number) {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return iso(year, month, day)
}

export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

/** "São Paulo" / "sao  paulo" → "sao paulo". */
export function normalizeCity(city: string) {
  return city.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export function holidaysForYear(
  year: number,
  place: { state?: string | null; city?: string | null } = {},
): Holiday[] {
  const list: Holiday[] = []
  const add = (rows: Fixed[], scope: HolidayScope) =>
    rows.forEach(([month, day, name]) => list.push({ date: iso(year, month, day), name, scope }))
  add(national, 'national')
  add(optional, 'optional')
  const sunday = easter(year)
  list.push({ date: shiftDate(sunday, -48), name: 'Carnaval (segunda)', scope: 'optional' })
  list.push({ date: shiftDate(sunday, -47), name: 'Carnaval', scope: 'optional' })
  list.push({ date: shiftDate(sunday, -2), name: 'Sexta-feira Santa', scope: 'national' })
  const state = place.state?.toUpperCase() ?? ''
  const capital = place.city ? capitals[`${state}:${normalizeCity(place.city)}`] : undefined
  list.push({
    date: shiftDate(sunday, 60),
    name: 'Corpus Christi',
    scope: capital?.corpusChristi ? 'municipal' : 'optional',
  })
  if (states[state]) add(states[state], 'state')
  if (capital) add(capital.days, 'municipal')
  // One entry per date: a stronger scope wins (national > state > municipal > optional).
  const rank: Record<HolidayScope, number> = { national: 0, state: 1, municipal: 2, optional: 3 }
  const byDate = new Map<string, Holiday>()
  for (const item of list) {
    const current = byDate.get(item.date)
    if (!current || rank[item.scope] < rank[current.scope]) byDate.set(item.date, item)
  }
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date))
}

/** Holidays between two YYYY-MM-DD dates (inclusive), across year boundaries. */
export function holidaysBetween(
  from: string,
  to: string,
  place: { state?: string | null; city?: string | null } = {},
): Holiday[] {
  const first = Number(from.slice(0, 4))
  const last = Number(to.slice(0, 4))
  const result: Holiday[] = []
  for (let year = first; year <= last; year++)
    result.push(
      ...holidaysForYear(year, place).filter((item) => item.date >= from && item.date <= to),
    )
  return result
}

export const holidayScopeLabel: Record<HolidayScope, string> = {
  national: 'Feriado nacional',
  state: 'Feriado estadual',
  municipal: 'Feriado municipal',
  optional: 'Ponto facultativo',
}
