import type { AnamnesisRecord, Level } from '@luminix/contracts/anamnesis'

// Client area model, filled from the Luminix API (`/client/*`, ADR-029). Only view preferences,
// the active space and which notices were read stay on the device.

export type Sex = 'female' | 'male'

export type Account = {
  email: string
  name: string
  phone: string
  createdAt: string
  language: 'pt-BR' | 'en' | 'es'
  notify: { reminders: boolean; promotions: boolean }
  /** Answered once after sign-up; spaces use it when the client allows (see SpaceLink). */
  anamnesis: Anamnesis | null
  activeSlug: string | null
  spaces: Record<string, SpaceLink>
}

export type SpaceSummary = {
  slug: string
  code: string | null
  name: string
  theme: string
  logoUrl: string | null
  city: string | null
  address: string | null
  category: string | null
  /** Text for the map lookup; null when the space publishes no address. */
  mapQuery: string | null
  /** Record level the space will ask for (preview; the API decides after linking). */
  anamnesisLevel: Level
  demo: boolean
}

/** Record in the shared format (packages/contracts, ADR-030). */
export type Anamnesis = AnamnesisRecord

export type AppointmentStatus = 'requested' | 'confirmed' | 'done' | 'cancelled'

export type Appointment = {
  id: string
  serviceId: string
  rentalDates?: string[] | null
  /** The space canceled it because its agenda changed. */
  canceledBySpace?: boolean
  cancelReason?: string | null
  serviceName: string
  category: string
  /** Clinic local time: 2026-11-20T14:30 */
  start: string
  durationMinutes: number
  priceCents: number
  status: AppointmentStatus
  createdAt: string
  updatedAt: string
  /** Who created it: the client in the app, or the clinic. */
  source: 'client' | 'manager' | 'import'
  professionalId: string | null
  professionalName: string | null
  previousStart: string | null
  rescheduledAt: string | null
  paymentMethod: Payment['method'] | null
  paid: boolean
  /** Already paid for this visit (deposit, app or at the space). */
  paidCents: number
  /** Sinal por Pix do espaço (ADR-037). */
  deposit?: Deposit | null
  /** Paid in the app through Stripe (ADR-040). */
  onlinePayment?: OnlinePayment | null
}

export type OnlinePayment = {
  status: 'awaiting' | 'paid' | 'expired' | 'refunded'
  dueAt: string | null
  /** Only the deposit, or the whole visit (ADR-042). */
  kind: 'full' | 'deposit'
  amountCents: number | null
}

export type Deposit = {
  cents: number
  status: 'awaiting' | 'reported' | 'confirmed' | 'expired'
  dueAt: string
  /** Only while it is still owed. */
  pix: { code: string; key: string; keyType: string; holder: string } | null
}

export type Payment = {
  id: string
  appointmentId: string | null
  label: string
  amountCents: number
  method: 'pix' | 'card' | 'local'
  status: 'paid' | 'pending' | 'refunded'
  at: string
  /** Paid in the app: Stripe has a receipt for it. */
  receipt?: boolean
}

export type NoticeKind = 'booking' | 'promo' | 'space' | 'app'

export type Notice = {
  id: string
  kind: NoticeKind
  title: string
  body: string
  at: string
  read: boolean
  href?: string
}

export type BookingPolicy = {
  allowCancellation: boolean
  cancellationNoticeMinutes: number
  reschedulingNoticeMinutes: number | null
  instructions: string
  /** Services that ask for a deposit to hold the time (ADR-042). */
  deposit?: { percent: number; serviceIds: string[] } | null
}

export type SpaceLink = {
  summary: SpaceSummary
  linkedAt: string
  /** True: this space reads the account record. False: it needs its own record below. */
  shareAnamnesis: boolean
  anamnesis: Anamnesis | null
  /** Record level the space requires (I basic, II health, III complete). */
  requiredLevel: Level
  /** False until the appointments of this space were fetched at least once. */
  loaded: boolean
  policy: BookingPolicy | null
  appointments: Appointment[]
  payments: Payment[]
  notices: Notice[]
}

export type Professional = {
  id: string
  name: string
  role: string | null
  photoUrl: string | null
}

export type Availability = {
  date: string
  lastDate: string
  durationMinutes: number
  bookingMode: 'instant' | 'request' | 'manual_release'
  /** More than one professional can do it: the client picks (or leaves it to the space). */
  choose: boolean
  /** Pix/card are offered only when the space accepts payments in the app. */
  inAppPayments: boolean
  /** The service asks for a deposit: paid in the app (online) or by the space's Pix. */
  deposit?: { percent: number; online: boolean; pix: boolean } | null
  professionals: Professional[]
  /** Free start times per professional id; "" is the single agenda of a space without team. */
  slots: Record<string, string[]>
}

/** A package the space sells (sessions of one service, or a combo). Sold by the team. */
export type SpacePackage = {
  id: string
  name: string
  kind: 'sessions' | 'combo'
  sessions: number
  priceCents: number
  validityDays: number | null
  /** The same sessions one by one, when cheaper in the package. */
  singleCents: number | null
  items: { serviceId: string; name: string; sessions: number }[]
}
