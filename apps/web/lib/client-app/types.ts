// Client area model. Today it is persisted on the device (see store.ts); the same shapes are the
// draft of the future API contract, so screens do not change when the backend arrives.

export type Sex = 'female' | 'male'

export type Account = {
  email: string
  name: string
  phone: string
  /** Salted SHA-256, device only. Replaced by real identity (ADR-027) when the API exists. */
  passHash: string
  salt: string
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
  demo: boolean
}

export type Anamnesis = {
  level: 1
  photo: string
  sex: Sex
  birthDate: string
  allergies: string
  healthNotes: string
  consent: true
  answeredAt: string
}

export type AppointmentStatus = 'requested' | 'confirmed' | 'done' | 'cancelled'

export type Appointment = {
  id: string
  serviceId: string
  serviceName: string
  category: string
  /** Local ISO without zone: 2026-11-20T14:30 */
  start: string
  durationMinutes: number
  priceCents: number
  status: AppointmentStatus
  createdAt: string
}

export type Payment = {
  id: string
  appointmentId: string | null
  label: string
  amountCents: number
  method: 'pix' | 'card' | 'local'
  status: 'paid' | 'pending' | 'refunded'
  at: string
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

export type SpaceLink = {
  summary: SpaceSummary
  linkedAt: string
  /** True: this space reads the account record. False: it needs its own record below. */
  shareAnamnesis: boolean
  anamnesis: Anamnesis | null
  appointments: Appointment[]
  payments: Payment[]
  notices: Notice[]
}
