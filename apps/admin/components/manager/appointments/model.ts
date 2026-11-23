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
  /** "A combinar"/"a partir de": the clinic already set the final amount of this visit. */
  priceAgreed?: boolean
  /** Session of a client package (price 0 on the visit; the money lives in the package). */
  package?: AppointmentPackage | null
}

/** Package of a visit; money fields are null for who does not see money. */
export type AppointmentPackage = {
  id: string
  name: string
  kind: 'combo' | 'sessions'
  /** paid (na venda) | per_visit (a cada sessão) | later (paga depois). */
  plan: 'paid' | 'per_visit' | 'later'
  session: number
  total: number
  priceCents: number | null
  paidCents: number | null
  remainingCents: number | null
  installmentCents: number | null
  visitPaidCents: number | null
  /** To charge at this visit: the installment ("a cada sessão") or the whole open balance. */
  dueNowCents: number | null
}

export const packagePlanLabel: Record<AppointmentPackage['plan'], string> = {
  paid: 'Pago na venda',
  per_visit: 'A cada sessão',
  later: 'Paga depois',
}

/** "Cobertura de Tatuagem (1/4)". */
export function serviceTitle(item: Pick<AppointmentView, 'service' | 'package'>) {
  return item.package?.session
    ? `${item.service} (${Math.min(item.package.session, item.package.total)}/${item.package.total})`
    : item.service
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
export function isFree(item: Pick<AppointmentView, 'priceCents' | 'priceType' | 'package'>) {
  return item.priceCents === 0 && item.priceType !== 'quote' && !item.package
}

/**
 * "A combinar" or "a partir de" whose final amount the clinic still has to set (at check-in, at
 * completion or when registering a payment). Paid only at the clinic.
 */
export function needsAgreedPrice(
  item: Pick<AppointmentView, 'priceType' | 'priceAgreed' | 'package' | 'paid'>,
) {
  return (
    !item.package &&
    !item.priceAgreed &&
    !item.paid &&
    (item.priceType === 'quote' || item.priceType === 'from')
  )
}

/** "A combinar" and still without an agreed amount. */
export function isQuote(item: Pick<AppointmentView, 'priceCents' | 'priceType'>) {
  return item.priceType === 'quote' && !item.priceCents
}

/**
 * Status on lists and the sheet. Booked by the team (admin) it enters as "Agendado" (yellow);
 * booked by the client (client area, site, WhatsApp later) as "Confirmado". The client's own
 * confirmation by WhatsApp shows as the green dot on the WhatsApp button, not here.
 */
export function visitBadge(
  item: Pick<AppointmentView, 'status' | 'checkedInAt' | 'bookingSource'>,
): { tone: 'pending' | 'ok' | 'done' | 'bad'; label: string; key: string } {
  if (item.status === 'canceled') return { tone: 'bad', label: 'Cancelado', key: 'canceled' }
  if (item.status === 'no_show') return { tone: 'bad', label: 'Faltou', key: 'no_show' }
  if (item.status === 'completed') return { tone: 'done', label: 'Concluído', key: 'completed' }
  if (item.checkedInAt) return { tone: 'ok', label: 'Chegou', key: 'here' }
  if (item.bookingSource && item.bookingSource !== 'manager' && item.bookingSource !== 'import')
    return { tone: 'ok', label: 'Confirmado', key: 'confirmed' }
  return { tone: 'pending', label: 'Agendado', key: 'scheduled' }
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
