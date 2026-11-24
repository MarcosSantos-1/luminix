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
  /** Sinal por Pix do espaço (ADR-037), when the client booked a service with deposit. */
  deposit?: AppointmentDeposit | null
  /** Confirmation link (ADR-038): opened and/or answered by whoever received it. */
  link?: AppointmentLinkState | null
  /** Client paying in the app (ADR-040): awaiting holds the slot until dueAt. */
  onlinePayment?: {
    status: 'awaiting' | 'paid' | 'expired' | 'refunded'
    dueAt: string | null
    /** Only the deposit of the visit, or all of it (ADR-042). */
    kind?: 'full' | 'deposit'
    /** Refund of the app payment: pending, refunded or failed (retry with "Estornar"). */
    refundStatus?: 'pending' | 'refunded' | 'failed' | null
  } | null
}

export type AppointmentLinkState = {
  answer: 'confirmed' | 'reschedule' | 'not_me' | 'canceled' | null
  answeredAt: string | null
  openedAt: string | null
}

export type AppointmentDeposit = {
  cents: number
  /** awaiting: slot held until dueAt · reported: the client says she paid · confirmed · expired */
  status: 'awaiting' | 'reported' | 'confirmed' | 'expired'
  dueAt: string
  reportedAt: string | null
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
  item: Pick<
    AppointmentView,
    'status' | 'checkedInAt' | 'bookingSource' | 'deposit' | 'link' | 'onlinePayment'
  >,
): { tone: 'pending' | 'ok' | 'done' | 'bad'; label: string; key: string } {
  if (item.status === 'canceled') return { tone: 'bad', label: 'Cancelado', key: 'canceled' }
  if (item.deposit?.status === 'awaiting' && isOpen(item.status))
    return { tone: 'pending', label: 'Aguardando sinal', key: 'deposit' }
  if (item.deposit?.status === 'reported' && isOpen(item.status))
    return { tone: 'pending', label: 'Sinal informado', key: 'deposit' }
  if (item.onlinePayment?.status === 'awaiting' && isOpen(item.status))
    return { tone: 'pending', label: 'Aguardando pagamento', key: 'deposit' }
  if (item.status === 'no_show') return { tone: 'bad', label: 'Faltou', key: 'no_show' }
  if (item.status === 'completed') return { tone: 'done', label: 'Concluído', key: 'completed' }
  if (item.checkedInAt) return { tone: 'ok', label: 'Chegou', key: 'here' }
  if (item.link?.answer === 'reschedule' && isOpen(item.status))
    return { tone: 'pending', label: 'Quer remarcar', key: 'reschedule' }
  if (presenceConfirmed(item)) return { tone: 'ok', label: 'Confirmado', key: 'confirmed' }
  return { tone: 'pending', label: 'Agendado', key: 'scheduled' }
}

/**
 * The client confirmed she is coming: she booked it herself (client area, site), or answered
 * "Confirmar presença" on the confirmation link (ADR-038). A visit the team booked stays pending
 * until then, whatever its database status.
 */
export function presenceConfirmed(
  item: Pick<AppointmentView, 'status' | 'bookingSource' | 'link'>,
) {
  if (!isOpen(item.status)) return false
  if (item.link?.answer === 'confirmed') return true
  if (item.link?.answer === 'reschedule') return false
  return Boolean(
    item.bookingSource && item.bookingSource !== 'manager' && item.bookingSource !== 'import',
  )
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
