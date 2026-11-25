import type { PublicService } from '../public-clinic'

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatMoney(cents: number) {
  return money.format(cents / 100)
}

export function effectivePrice(service: PublicService) {
  return service.promoPriceCents ?? service.priceCents
}

export function priceLabel(service: PublicService) {
  if (service.priceType === 'quote') return 'Sob consulta'
  const value = formatMoney(effectivePrice(service))
  return service.priceType === 'from' ? `A partir de ${value}` : value
}

export function durationLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`
  const rest = minutes % 60
  return rest ? `${Math.floor(minutes / 60)}h${String(rest).padStart(2, '0')}` : `${minutes / 60}h`
}

const pad = (value: number) => String(value).padStart(2, '0')

/** Local calendar day as YYYY-MM-DD (never toISOString: that shifts the day in UTC-3). */
export function dayKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function parseLocal(value: string) {
  const [day, time = '00:00'] = value.split('T')
  const [year, month, date] = day.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  return new Date(year, month - 1, date, hour, minute)
}

export function addDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

/** How long a visit takes: a combo that pauses at lunch says until when, not 6h30. */
export function visitLength(visit: { durationMinutes: number; endsAt?: string | null }) {
  return visit.endsAt ? `até ${visit.endsAt}` : durationLabel(visit.durationMinutes)
}

export function timeLabel(value: string) {
  return value.slice(11, 16)
}

export function dateLabel(value: string, style: 'long' | 'short' = 'long') {
  return parseLocal(value).toLocaleDateString(
    'pt-BR',
    style === 'long'
      ? { weekday: 'long', day: 'numeric', month: 'long' }
      : { day: '2-digit', month: 'short' },
  )
}

export function relativeDay(value: string, now = new Date()) {
  const key = value.slice(0, 10)
  if (key === dayKey(now)) return 'Hoje'
  if (key === dayKey(addDays(now, 1))) return 'Amanhã'
  return dateLabel(value)
}

export function timeAgo(iso: string, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000))
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  if (minutes < 1440) return `há ${Math.floor(minutes / 60)} h`
  const days = Math.floor(minutes / 1440)
  return days === 1 ? 'ontem' : `há ${days} dias`
}

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? ''
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts.at(-1)![0] : '')).toUpperCase()
}

type Hours = { weekday: number; available: boolean; periods: { start: string; end: string }[] }[]

/** Start times for a day, from the clinic hours (or 09–18, Mon–Sat when none are published). */
export function slotsFor(day: Date, hours: Hours, durationMinutes: number, taken: Set<string>) {
  const rule = hours.find((item) => item.weekday === day.getDay())
  const periods = hours.length
    ? rule?.available
      ? rule.periods
      : []
    : day.getDay() === 0
      ? []
      : [{ start: '09:00', end: '18:00' }]
  const now = new Date()
  const result: string[] = []
  for (const { start, end } of periods) {
    const [startHour, startMinute] = start.split(':').map(Number)
    const [endHour, endMinute] = end.split(':').map(Number)
    for (
      let minute = startHour * 60 + startMinute;
      minute + durationMinutes <= endHour * 60 + endMinute;
      minute += 30
    ) {
      const label = `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`
      const value = `${dayKey(day)}T${label}`
      if (parseLocal(value) > now && !taken.has(value)) result.push(label)
    }
  }
  return result
}
