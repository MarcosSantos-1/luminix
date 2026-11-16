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

export type AnamnesisInput = Omit<Anamnesis, 'level' | 'answeredAt' | 'consent'>

export type AppointmentStatus = 'requested' | 'confirmed' | 'done' | 'cancelled'

export type Appointment = {
  id: string
  serviceId: string
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

export type BookingPolicy = {
  allowCancellation: boolean
  cancellationNoticeMinutes: number
  reschedulingNoticeMinutes: number | null
  instructions: string
}

export type SpaceLink = {
  summary: SpaceSummary
  linkedAt: string
  /** True: this space reads the account record. False: it needs its own record below. */
  shareAnamnesis: boolean
  anamnesis: Anamnesis | null
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
  bookingMode: 'instant' | 'request'
  /** More than one professional can do it: the client picks (or leaves it to the space). */
  choose: boolean
  professionals: Professional[]
  /** Free start times per professional id; "" is the single agenda of a space without team. */
  slots: Record<string, string[]>
}
