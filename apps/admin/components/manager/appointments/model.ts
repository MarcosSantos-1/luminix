/** One appointment as Início, Agenda and the appointment sheet show it. */
export type AppointmentView = {
  rentalDates?: string[] | null
  id: string
  startsAt: string
  endsAt?: string | null
  /** Where it was before being rescheduled. */
  previousStartsAt: string | null
  status: string
  clientId: string
  client: string
  phone: string | null
  /** Notes on the client record (allergies, care) — only for who can read clients. */
  clientNotes: string | null
  /** Internal notes of this appointment. */
  notes: string | null
  /** Booked over a warning: past | outside_availability | overlap. */
  warnings: string[]
  service: string
  professional: string | null
  /** null when the person's level does not show money. */
  priceCents: number | null
  /** Received so far (payments in parts); null when the person's level does not show money. */
  paidCents?: number | null
  /** manager | client | import: who booked it. */
  bookingSource?: string
  /** The client arrived (check-in). */
  checkedInAt?: string | null
  /** Why it was canceled. */
  statusNote?: string | null
  /** fixed | from | quote ("a combinar": the amount is agreed and typed at payment). */
  priceType?: string
  paid: boolean
  /** Signed photo of the client when the record has one. */
  photoUrl?: string | null
  /** Larger copy of the same photo, for the enlarged view. */
  photoLargeUrl?: string | null
  /** The client sent a photo through the client area; it is loaded on demand. */
  accountPhoto?: boolean
}

export type AppointmentAccess = {
  manage: boolean
  /** May register a payment (finance). */
  charge: boolean
  /** May open the full client record. */
  openClients: boolean
}

export type BookingWarning = { code: string; title: string; detail: string }

export const zone = 'America/Sao_Paulo'

export const warningCopy: Record<string, string> = {
  past: 'Marcado em um horário que já tinha passado.',
  outside_availability: 'Marcado fora do horário de atendimento.',
  overlap: 'Marcado junto com outro atendimento.',
}

/** Free on purpose (avaliação, cortesia): nothing to receive. Unknown without money access. */
export function isFree(item: Pick<AppointmentView, 'priceCents' | 'priceType'>) {
  return item.priceCents === 0 && item.priceType !== 'quote'
}

/** "A combinar" and still without an agreed amount. */
export function isQuote(item: Pick<AppointmentView, 'priceCents' | 'priceType'>) {
  return item.priceType === 'quote' && !item.priceCents
}

export function isOpen(status: string) {
  return status === 'scheduled' || status === 'confirmed'
}

export function needsAttention(item: AppointmentView) {
  return Boolean(item.clientNotes || item.notes || item.warnings.length)
}

export function clock(iso: string, timeZone = zone) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone })
}

/** "2026-11-12" in the clinic time zone. */
export function localDate(iso: string | Date, timeZone = zone) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone })
}

/** "qui., 12 de nov." */
export function dayLabel(iso: string, timeZone = zone) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    timeZone,
  })
}

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name
}

/** Ready WhatsApp texts; the manager sends them with one tap. */
export function reminderText(item: AppointmentView, today: string) {
  const when =
    localDate(item.startsAt) === today
      ? `hoje às ${clock(item.startsAt)}`
      : `${dayLabel(item.startsAt)} às ${clock(item.startsAt)}`
  return `Olá, ${firstName(item.client)}! Passando para lembrar do seu horário de ${item.service}, ${when}.`
}

export function confirmationText(item: AppointmentView, today: string) {
  return `${reminderText(item, today)} Você confirma a presença? Responda SIM para confirmar ou me avise se precisar remarcar.`
}
