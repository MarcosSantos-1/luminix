const pad = (value: number) => String(value).padStart(2, '0')

/** Local calendar day as YYYY-MM-DD (never toISOString: that shifts the day in UTC-3). */
export function dayKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function addDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

export function parseDay(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  return new Date(year, month - 1, day)
}

const weekdays = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const monthsLong = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

export const weekdayShort = (date: Date) => weekdays[date.getDay()].slice(0, 3)
export const monthShort = (date: Date) => months[date.getMonth()]
export const monthLong = (date: Date) => monthsLong[date.getMonth()]

/** "segunda, 17 de novembro" */
export function dateLabel(value: string) {
  const date = parseDay(value)
  return `${weekdays[date.getDay()]}, ${date.getDate()} de ${monthsLong[date.getMonth()]}`
}

export function relativeDay(value: string, now = new Date()) {
  const key = value.slice(0, 10)
  if (key === dayKey(now)) return 'Hoje'
  if (key === dayKey(addDays(now, 1))) return 'Amanhã'
  const label = dateLabel(value)
  return label[0].toUpperCase() + label.slice(1)
}

export function timeAgo(iso: string, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000))
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  if (minutes < 1440) return `há ${Math.floor(minutes / 60)} h`
  const days = Math.floor(minutes / 1440)
  return days === 1 ? 'ontem' : `há ${days} dias`
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return (
    (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')
  ).toUpperCase()
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? ''
