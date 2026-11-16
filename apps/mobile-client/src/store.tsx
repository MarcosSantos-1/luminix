// Client state backed by Firebase Authentication and the Luminix API (`/client/*`, ADR-029).
// Same account as the site: whatever is saved on one appears on the other. The phone keeps only
// conveniences: intro seen, permissions screen seen, active space and read notices.
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updatePassword,
} from 'firebase/auth'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  normalizeRecord,
  type AnamnesisRecord,
  type Answers,
  type Level,
} from '@luminix/contracts/anamnesis'
import { loadSpace, type SpaceSummary } from './api'
import { clientAuth } from './firebase'

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://luminix-api.fly.dev').replace(
  /\/$/,
  '',
)
const LOCAL_KEY = 'luminix.app.v2'

/** Record in the shared format (packages/contracts, ADR-030). */
export type Anamnesis = AnamnesisRecord
export type AppointmentStatus = 'requested' | 'confirmed' | 'done' | 'cancelled'
export type PaymentMethod = 'local' | 'pix' | 'card'
export type Appointment = {
  id: string
  serviceId: string
  serviceName: string
  category: string
  /** Clinic local time, 2026-11-20T14:30 */
  start: string
  durationMinutes: number
  priceCents: number
  status: AppointmentStatus
  source: 'client' | 'manager' | 'import'
  professionalId: string | null
  professionalName: string | null
  previousStart: string | null
  rescheduledAt: string | null
  paymentMethod: PaymentMethod | null
  paid: boolean
  createdAt: string
  updatedAt: string
}
export type Payment = {
  id: string
  label: string
  amountCents: number
  method: PaymentMethod
  status: 'paid' | 'pending' | 'refunded'
  at: string
}
export type Notice = {
  id: string
  kind: 'booking' | 'space'
  title: string
  body: string
  at: string
  read: boolean
}
export type Policy = {
  allowCancellation: boolean
  cancellationNoticeMinutes: number
  reschedulingNoticeMinutes: number | null
  instructions: string
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
  choose: boolean
  /** Pix/card are offered only when the space accepts payments in the app. */
  inAppPayments: boolean
  professionals: Professional[]
  slots: Record<string, string[]>
}
export type LinkedSpace = {
  summary: SpaceSummary
  linkedAt: string
  shareAnamnesis: boolean
  ownAnamnesis: Anamnesis | null
  /** Record level the space requires (I basic, II health, III complete). */
  requiredLevel: Level
}
export type Account = {
  uid: string
  email: string
  name: string
  phone: string
  createdAt: string
  anamnesis: Anamnesis | null
  spaces: LinkedSpace[]
}

type ApiAnamnesis = unknown
type Me = {
  profile: {
    name: string | null
    email: string | null
    phone: string | null
    anamnesis: ApiAnamnesis | null
    photo: string | null
    createdAt: string
  } | null
  spaces: {
    slug: string
    shareAnamnesis: boolean
    ownAnamnesis: ApiAnamnesis | null
    ownPhoto: string | null
    requiredLevel: Level
    linkedAt: string
  }[]
}
type ApiAppointment = {
  id: string
  start: { date: string; clock: string }
  startsAt: string
  endsAt: string
  status: 'scheduled' | 'confirmed' | 'completed' | 'canceled' | 'no_show'
  source: Appointment['source']
  priceCents: number | null
  previousStartsAt: string | null
  rescheduledAt: string | null
  updatedAt: string
  createdAt: string
  paymentMethod: PaymentMethod | null
  paid: boolean
  service: { id: string; name: string; category: string | null }
  professional: { id: string; name: string } | null
}
type Local = {
  seenIntro: boolean
  permissionsSeen: boolean
  activeSlug: string | null
  read: string[]
}

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code)
  }
}

async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const user = clientAuth().currentUser
  if (!user) throw new ApiError(401, 'Authentication required')
  const response = await fetch(`${API_URL}${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      authorization: `Bearer ${await user.getIdToken()}`,
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  })
  const data = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) throw new ApiError(response.status, data.error ?? 'Request failed')
  return data as T
}

const messages: Record<string, string> = {
  'Slot taken': 'Esse horário acabou de ser ocupado. Escolha outro.',
  'Cancellation closed': 'O prazo para cancelar pelo app já passou. Fale com o espaço.',
  'Rescheduling closed': 'O prazo para remarcar pelo app já passou. Fale com o espaço.',
  'Too many requests': 'Muitas tentativas seguidas. Aguarde um minuto.',
  'Invalid phone': 'Confira o celular com DDD.',
  'Record required': 'Complete a ficha que este espaço pede antes de agendar.',
  'Record expired': 'Sua ficha venceu. Confirme seus dados para agendar de novo.',
  'Payment unavailable': 'Este espaço recebe o pagamento no dia do atendimento.',
}
export function friendly(error: unknown) {
  if (error instanceof ApiError)
    return messages[error.code] ?? 'Não foi possível concluir. Tente de novo.'
  return 'Sem conexão com o Luminix. Verifique a internet.'
}
function firebaseMessage(error: unknown) {
  const code = (error as { code?: string })?.code ?? ''
  if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(code))
    return 'E-mail ou senha incorretos.'
  if (code.includes('email-already-in-use'))
    return 'Já existe uma conta com este e-mail. Entre com ela.'
  if (code.includes('weak-password'))
    return 'Escolha uma senha mais forte (pelo menos 8 caracteres).'
  if (code.includes('too-many-requests')) return 'Muitas tentativas. Aguarde alguns minutos.'
  if (code.includes('network')) return 'Sem conexão. Verifique a internet.'
  return 'Não foi possível entrar agora. Tente de novo.'
}

const statusMap: Record<ApiAppointment['status'], AppointmentStatus> = {
  scheduled: 'requested',
  confirmed: 'confirmed',
  completed: 'done',
  canceled: 'cancelled',
  no_show: 'cancelled',
}

function toLocal(iso: string) {
  // São Paulo has no daylight saving time: a fixed -03:00 offset is exact.
  return new Date(new Date(iso).getTime() - 3 * 3_600_000).toISOString().slice(0, 16)
}

function toAppointment(row: ApiAppointment): Appointment {
  return {
    id: row.id,
    serviceId: row.service.id,
    serviceName: row.service.name,
    category: row.service.category ?? '',
    start: `${row.start.date}T${row.start.clock}`,
    durationMinutes: Math.round((Date.parse(row.endsAt) - Date.parse(row.startsAt)) / 60_000),
    priceCents: row.priceCents ?? 0,
    status: statusMap[row.status],
    source: row.source,
    professionalId: row.professional?.id ?? null,
    professionalName: row.professional?.name ?? null,
    previousStart: row.previousStartsAt ? toLocal(row.previousStartsAt) : null,
    rescheduledAt: row.rescheduledAt,
    paymentMethod: row.paymentMethod,
    paid: row.paid,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** Epoch ms of a clinic-local start. */
export const startTime = (start: string) => Date.parse(`${start}:00-03:00`)

/** A confirmed time that already ended counts as done; an unanswered request, as lapsed. */
export function displayStatus(item: Appointment, now = Date.now()): AppointmentStatus {
  const ended = startTime(item.start) + item.durationMinutes * 60_000 < now
  if (item.status === 'confirmed' && ended) return 'done'
  if (item.status === 'requested' && ended) return 'cancelled'
  return item.status
}

export function paymentsOf(appointments: Appointment[]): Payment[] {
  return appointments
    .filter((item) => item.priceCents > 0)
    .flatMap((item): Payment[] => {
      const method = item.paymentMethod ?? 'local'
      const prepaid = method !== 'local'
      if (item.status === 'cancelled' && !prepaid && !item.paid) return []
      return [
        {
          id: `pay-${item.id}`,
          label: item.serviceName,
          amountCents: item.priceCents,
          method,
          status:
            item.status === 'cancelled' ? 'refunded' : prepaid || item.paid ? 'paid' : 'pending',
          at: item.createdAt,
        },
      ]
    })
}

const short = (start: string) =>
  `${start.slice(8, 10)}/${start.slice(5, 7)} às ${start.slice(11, 16)}`

function noticesOf(space: LinkedSpace, appointments: Appointment[], read: Set<string>): Notice[] {
  const now = Date.now()
  const list: Omit<Notice, 'read'>[] = [
    {
      id: `welcome-${space.summary.slug}`,
      kind: 'space',
      title: `Você entrou em ${space.summary.name}`,
      body: 'Conheça os serviços e marque seu horário quando quiser.',
      at: space.linkedAt,
    },
  ]
  for (const item of appointments) {
    const when = startTime(item.start)
    if (item.status === 'cancelled') {
      if (now - Date.parse(item.updatedAt) < 30 * 86_400_000)
        list.push({
          id: `cancel-${item.id}`,
          kind: 'booking',
          title: 'Horário cancelado',
          body: `${item.serviceName} de ${short(item.start)} foi cancelado.`,
          at: item.updatedAt,
        })
      continue
    }
    if (item.rescheduledAt)
      list.push({
        id: `moved-${item.id}-${item.rescheduledAt}`,
        kind: 'booking',
        title: 'Horário remarcado',
        body: `${item.serviceName}: novo horário ${short(item.start)}.`,
        at: item.rescheduledAt,
      })
    if (when < now) continue
    list.push({
      id: `${item.status}-${item.id}`,
      kind: 'booking',
      title:
        item.source !== 'client'
          ? 'O espaço marcou um horário para você'
          : item.status === 'confirmed'
            ? 'Horário confirmado'
            : 'Pedido enviado ao espaço',
      body: `${item.serviceName} em ${short(item.start)}${item.professionalName ? ` com ${item.professionalName}` : ''}.`,
      at: item.status === 'confirmed' ? item.updatedAt : item.createdAt,
    })
    if (when - now < 48 * 3_600_000)
      list.push({
        id: `reminder-${item.id}-${item.start}`,
        kind: 'booking',
        title: 'Lembrete de horário',
        body: `${item.serviceName}, ${short(item.start)}. Até lá!`,
        at: new Date(Math.max(when - 48 * 3_600_000, Date.parse(item.createdAt))).toISOString(),
      })
  }
  return list
    .sort((a, b) => b.at.localeCompare(a.at))
    .map((item) => ({ ...item, read: read.has(item.id) }))
}

type Store = {
  ready: boolean
  seenIntro: boolean
  permissionsSeen: boolean
  account: Account | null
  space: LinkedSpace | null
  /** The record the active space reads: the account one when shared, else its own. */
  anamnesis: Anamnesis | null
  appointments: Appointment[] | null
  policy: Policy | null
  payments: Payment[]
  notices: Notice[]
  unread: number
  refreshing: boolean
  finishIntro: () => void
  markPermissionsSeen: () => void
  signUp: (input: {
    name: string
    email: string
    phone: string
    password: string
  }) => Promise<string | null>
  signIn: (email: string, password: string) => Promise<string | null>
  resetPassword: (email: string) => Promise<string | null>
  changePassword: (current: string, next: string) => Promise<string | null>
  signOut: () => void
  saveProfile: (input: { name: string; phone: string }) => Promise<string | null>
  saveAnamnesis: (
    slug: string | null,
    record: { level: Level; answers: Answers; photo: string },
  ) => Promise<string | null>
  joinSpace: (space: SpaceSummary, share: boolean) => Promise<string | null>
  enterSpace: (slug: string) => void
  leaveSpace: (slug: string) => Promise<string | null>
  refresh: () => Promise<void>
  availability: (serviceId: string, date: string, ignore?: string) => Promise<Availability | null>
  book: (input: {
    serviceId: string
    professionalId: string | null
    start: string
    method: PaymentMethod
  }) => Promise<{ error: string | null; status?: 'confirmed' | 'scheduled' }>
  reschedule: (id: string, start: string) => Promise<string | null>
  cancel: (id: string) => Promise<string | null>
  markRead: (id?: string) => void
}

const Context = createContext<Store | null>(null)
const DEFAULT_LOCAL: Local = {
  seenIntro: false,
  permissionsSeen: false,
  activeSlug: null,
  read: [],
}

export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [local, setLocal] = useState<Local | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [user, setUser] = useState<{ uid: string; email: string } | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [summaries, setSummaries] = useState<Record<string, SpaceSummary>>({})
  const [data, setData] = useState<Record<string, { policy: Policy; appointments: Appointment[] }>>(
    {},
  )
  const [refreshing, setRefreshing] = useState(false)
  const signingUp = useRef(false)
  const summariesRef = useRef(summaries)
  summariesRef.current = summaries

  useEffect(() => {
    AsyncStorage.getItem(LOCAL_KEY)
      .then((raw) =>
        setLocal(raw ? { ...DEFAULT_LOCAL, ...(JSON.parse(raw) as Local) } : DEFAULT_LOCAL),
      )
      .catch(() => setLocal(DEFAULT_LOCAL))
  }, [])

  const patchLocal = useCallback((change: Partial<Local>) => {
    setLocal((current) => {
      const next = { ...(current ?? DEFAULT_LOCAL), ...change }
      void AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(next)).catch(() => {})
      return next
    })
  }, [])

  const loadAppointments = useCallback(async (slug: string) => {
    try {
      const result = await api<{ policy: Policy; appointments: ApiAppointment[] }>(
        `/client/spaces/${encodeURIComponent(slug)}/appointments`,
      )
      setData((current) => ({
        ...current,
        [slug]: { policy: result.policy, appointments: result.appointments.map(toAppointment) },
      }))
    } catch {
      // Keeps what is shown; pull to refresh tries again.
    }
  }, [])

  const loadMe = useCallback(async () => {
    const next = await api<Me>('/client/me')
    const missing = next.spaces
      .map((item) => item.slug)
      .filter((slug) => !summariesRef.current[slug])
    const found = await Promise.all(missing.map((slug) => loadSpace(slug)))
    setSummaries((current) => {
      const copy = { ...current }
      found.forEach((item, index) => {
        if (item) copy[missing[index]] = item.summary
      })
      return copy
    })
    setMe(next)
    return next
  }, [])

  useEffect(
    () =>
      onAuthStateChanged(clientAuth(), (current) => {
        if (!current) {
          setUser(null)
          setMe(null)
          setData({})
          setAuthReady(true)
          return
        }
        const email = current.email ?? ''
        // Not ready until the account is loaded, so the gate never routes on half the data.
        setAuthReady(false)
        setUser({ uid: current.uid, email })
        void (async () => {
          try {
            const loaded = await loadMe()
            if (!loaded.profile && !signingUp.current) {
              await api('/client/me', {
                method: 'PUT',
                body: { name: current.displayName || email.split('@')[0] || 'Cliente', email },
              })
              await loadMe()
            }
          } catch {
            // Offline: screens show what they can and retry on refresh.
          }
          setAuthReady(true)
        })()
      }),
    [loadMe],
  )

  const account = useMemo<Account | null>(() => {
    if (!user || !me?.profile) return null
    const profile = me.profile
    const toRecord = (record: ApiAnamnesis | null, photo: string | null) =>
      normalizeRecord(record, photo)
    return {
      uid: user.uid,
      email: profile.email ?? user.email,
      name: profile.name ?? '',
      phone: profile.phone ?? '',
      createdAt: profile.createdAt,
      anamnesis: toRecord(profile.anamnesis, profile.photo),
      spaces: me.spaces.flatMap((item) =>
        summaries[item.slug]
          ? [
              {
                summary: summaries[item.slug],
                linkedAt: item.linkedAt,
                shareAnamnesis: item.shareAnamnesis,
                ownAnamnesis: toRecord(item.ownAnamnesis, item.ownPhoto),
                requiredLevel: item.requiredLevel ?? 1,
              },
            ]
          : [],
      ),
    }
  }, [user, me, summaries])

  // A new phone has no preference yet: the oldest linked space opens.
  const space =
    account?.spaces.find((item) => item.summary.slug === local?.activeSlug) ??
    account?.spaces[0] ??
    null
  const slug = space?.summary.slug ?? null

  useEffect(() => {
    if (slug && !data[slug]) void loadAppointments(slug)
  }, [slug, data, loadAppointments])

  const current = slug ? data[slug] : undefined
  const appointments = current?.appointments ?? null
  const read = useMemo(() => new Set(local?.read ?? []), [local?.read])
  const notices = useMemo(
    () => (space && appointments ? noticesOf(space, appointments, read) : []),
    [space, appointments, read],
  )

  const store = useMemo<Store>(
    () => ({
      ready: Boolean(local) && authReady && (!user || Boolean(me)),
      seenIntro: local?.seenIntro ?? false,
      permissionsSeen: local?.permissionsSeen ?? false,
      account,
      space,
      anamnesis: !account
        ? null
        : space && !space.shareAnamnesis
          ? space.ownAnamnesis
          : account.anamnesis,
      appointments,
      policy: current?.policy ?? null,
      payments: appointments ? paymentsOf(appointments) : [],
      notices,
      unread: notices.filter((item) => !item.read).length,
      refreshing,
      finishIntro: () => patchLocal({ seenIntro: true }),
      markPermissionsSeen: () => patchLocal({ permissionsSeen: true }),
      async signUp({ name, email: rawEmail, phone, password }) {
        const email = rawEmail.trim().toLowerCase()
        if (name.trim().length < 2) return 'Informe seu nome.'
        if (!isEmail(email)) return 'Informe um e-mail válido.'
        if (password.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.'
        const digits = phone.replace(/\D/g, '')
        if (digits && digits.length < 10) return 'Confira o celular com DDD.'
        signingUp.current = true
        try {
          await createUserWithEmailAndPassword(clientAuth(), email, password)
        } catch (error) {
          signingUp.current = false
          return firebaseMessage(error)
        }
        try {
          await api('/client/me', {
            method: 'PUT',
            body: { name: name.trim(), email, ...(digits ? { phone: digits } : {}) },
          })
          await loadMe()
          return null
        } catch (error) {
          return friendly(error)
        } finally {
          signingUp.current = false
        }
      },
      async signIn(email, password) {
        try {
          await signInWithEmailAndPassword(clientAuth(), email.trim().toLowerCase(), password)
          return null
        } catch (error) {
          return firebaseMessage(error)
        }
      },
      async resetPassword(rawEmail) {
        const email = rawEmail.trim().toLowerCase()
        if (!isEmail(email)) return 'Digite seu e-mail para receber o link.'
        try {
          await sendPasswordResetEmail(clientAuth(), email)
        } catch (error) {
          if (!String((error as { code?: string })?.code).includes('user-not-found'))
            return firebaseMessage(error)
        }
        return null
      },
      async changePassword(currentPassword, next) {
        const signed = clientAuth().currentUser
        if (!signed?.email) return 'Sessão encerrada. Entre de novo.'
        if (next.length < 8) return 'A nova senha precisa ter pelo menos 8 caracteres.'
        try {
          await reauthenticateWithCredential(
            signed,
            EmailAuthProvider.credential(signed.email, currentPassword),
          )
        } catch {
          return 'Senha atual incorreta.'
        }
        try {
          await updatePassword(signed, next)
          return null
        } catch (error) {
          return firebaseMessage(error)
        }
      },
      signOut: () => {
        patchLocal({ activeSlug: null })
        void firebaseSignOut(clientAuth())
      },
      async saveProfile({ name, phone }) {
        const digits = phone.replace(/\D/g, '')
        try {
          await api('/client/me', {
            method: 'PUT',
            body: {
              name: name.trim(),
              email: account?.email ?? user?.email ?? '',
              ...(digits ? { phone: digits } : {}),
            },
          })
          await loadMe()
          return null
        } catch (error) {
          return friendly(error)
        }
      },
      async saveAnamnesis(target, record) {
        try {
          await api(
            target
              ? `/client/spaces/${encodeURIComponent(target)}/anamnesis`
              : '/client/me/anamnesis',
            {
              method: 'PUT',
              body: { ...record, consent: true },
            },
          )
          await loadMe()
          return null
        } catch (error) {
          return friendly(error)
        }
      },
      async joinSpace(summary, share) {
        try {
          await api('/client/spaces', {
            method: 'POST',
            body: { slug: summary.slug, shareAnamnesis: share },
          })
          setSummaries((copy) => ({ ...copy, [summary.slug]: summary }))
          patchLocal({ activeSlug: summary.slug })
          await loadMe()
          return null
        } catch (error) {
          return friendly(error)
        }
      },
      enterSpace: (target) => patchLocal({ activeSlug: target }),
      async leaveSpace(target) {
        try {
          await api(`/client/spaces/${encodeURIComponent(target)}`, { method: 'DELETE' })
          if (local?.activeSlug === target) patchLocal({ activeSlug: null })
          await loadMe()
          return null
        } catch (error) {
          return friendly(error)
        }
      },
      async refresh() {
        setRefreshing(true)
        try {
          await loadMe()
          if (slug) await loadAppointments(slug)
        } catch {
          // Offline: keep what is on screen.
        }
        setRefreshing(false)
      },
      async availability(serviceId, date, ignore) {
        if (!slug) return null
        try {
          const query = `serviceId=${serviceId}&date=${date}${ignore ? `&ignore=${ignore}` : ''}`
          return await api<Availability>(
            `/client/spaces/${encodeURIComponent(slug)}/availability?${query}`,
          )
        } catch {
          return null
        }
      },
      async book({ serviceId, professionalId, start, method }) {
        if (!slug) return { error: 'Escolha um espaço.' }
        try {
          const result = await api<{ status: 'confirmed' | 'scheduled' }>(
            `/client/spaces/${encodeURIComponent(slug)}/appointments`,
            {
              method: 'POST',
              body: {
                serviceId,
                ...(professionalId ? { professionalId } : {}),
                localStartsAt: start,
                paymentMethod: method,
              },
            },
          )
          await loadAppointments(slug)
          return { error: null, status: result.status }
        } catch (error) {
          return { error: friendly(error) }
        }
      },
      async reschedule(id, start) {
        if (!slug) return 'Escolha um espaço.'
        try {
          await api(`/client/spaces/${encodeURIComponent(slug)}/appointments/${id}/reschedule`, {
            method: 'POST',
            body: { localStartsAt: start },
          })
          await loadAppointments(slug)
          return null
        } catch (error) {
          return friendly(error)
        }
      },
      async cancel(id) {
        if (!slug) return 'Escolha um espaço.'
        try {
          await api(`/client/spaces/${encodeURIComponent(slug)}/appointments/${id}/cancel`, {
            method: 'POST',
          })
          await loadAppointments(slug)
          return null
        } catch (error) {
          return friendly(error)
        }
      },
      markRead: (id) => {
        const ids = id ? [id] : notices.map((item) => item.id)
        patchLocal({ read: [...new Set([...(local?.read ?? []), ...ids])].slice(-400) })
      },
    }),
    [
      local,
      authReady,
      user,
      me,
      account,
      space,
      appointments,
      current,
      notices,
      refreshing,
      slug,
      patchLocal,
      loadMe,
      loadAppointments,
    ],
  )

  return <Context.Provider value={store}>{children}</Context.Provider>
}

export function useStore() {
  const store = useContext(Context)
  if (!store) throw new Error('useStore outside StoreProvider')
  return store
}
