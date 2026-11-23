/** Formatting shared by the business sections (Início, Serviços, Financeiro, Estoque…). */

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function money(cents: number) {
  return brl.format(cents / 100)
}

/**
 * Keeps a big amount inside a small card. From R$ 5.000,00 up: "R$ 5,0k", then "R$ 1,2 mi".
 * The full "R$ 5.000,00" stays available as a title on the element that shows this.
 */
export function moneyCompact(cents: number) {
  const sign = cents < 0 ? '−' : ''
  const abs = Math.abs(cents)
  if (abs < 500_000) return money(cents)
  if (abs < 100_000_000) {
    const thousands = abs / 100_000
    const digits = thousands >= 100 ? 0 : 1
    const text = thousands.toLocaleString('pt-BR', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
    return `${sign}R$ ${text}k`
  }
  const millions = abs / 100_000_000
  const digits = millions >= 10 ? 0 : 1
  const text = millions.toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
  return `${sign}R$ ${text} mi`
}

/** "Juliana Lima Costa" → "Juliana C." so a name fits one line on a phone. */
export function shortName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toLocaleUpperCase('pt-BR')}.`
}

/** "120", "120,5", "R$ 1.200,50" → cents; empty or invalid → null. */
export function parseMoney(value: string): number | null {
  const clean = value.replace(/[^\d,.]/g, '')
  if (!clean) return null
  const normalized = clean.includes(',')
    ? clean.replace(/\./g, '').replace(',', '.')
    : clean.replace(/\.(?=\d{3}(\D|$))/g, '')
  const number = Number(normalized)
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : null
}

const plain = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Cents → editable text with thousands ("5.450,00"). */
export function moneyInput(cents: number) {
  return plain.format(cents / 100)
}

export function dateBr(iso: string | null | undefined) {
  if (!iso) return ''
  const [year, month, day] = iso.slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}

export function shortDateBr(iso: string) {
  const [, month, day] = iso.slice(0, 10).split('-')
  return `${day}/${month}`
}

export function timeBr(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

export function percent(value: number) {
  return `${Math.round(value * 100)}%`
}

export function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || '?'
  )
}

/** WhatsApp link with a ready message; null when the phone is unknown. */
export function whatsapp(phone: string | null, text: string) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 10 ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null
}

/** Date in the clinic time zone, as YYYY-MM-DD. */
export function todayIso() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

export function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export const appointmentStatus: Record<string, { label: string; tone: 'on' | 'off' | 'info' }> = {
  scheduled: { label: 'Agendado', tone: 'info' },
  confirmed: { label: 'Confirmado', tone: 'info' },
  completed: { label: 'Concluído', tone: 'on' },
  canceled: { label: 'Cancelado', tone: 'off' },
  no_show: { label: 'Faltou', tone: 'off' },
}
