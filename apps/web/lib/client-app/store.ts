'use client'

// Client area state backed by the Luminix API (`/client/*`) and Firebase Authentication.
// The device keeps only conveniences: active space, view preferences and read notices.

import { useSyncExternalStore } from 'react'
import {
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updatePassword,
  type User,
} from 'firebase/auth'
import { normalizeRecord, type Answers, type Level } from '@luminix/contracts/anamnesis'
import { clientAuth } from './firebase'
import type {
  Account,
  Anamnesis,
  Appointment,
  Availability,
  Deposit,
  BookingPolicy,
  Notice,
  OnlinePayment,
  Payment,
  SpaceLink,
  SpaceSummary,
  SpacePackage,
} from './types'

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
  paymentMethod: Payment['method'] | null
  paid: boolean
  paidCents?: number
  presenceConfirmed?: boolean
  rentalDates?: string[] | null
  canceledBySpace?: boolean
  cancelReason?: string | null
  deposit?: Deposit | null
  onlinePayment?: (Omit<OnlinePayment, 'kind' | 'amountCents'> & Partial<OnlinePayment>) | null
  service: { id: string; name: string; category: string | null }
  professional: { id: string; name: string } | null
}
type Prefs = Pick<Account, 'language' | 'notify'> & {
  activeSlug: string | null
  read: string[]
  /** Notices the client deleted (they are derived from data, so the device hides them). */
  hidden?: string[]
}

type VoucherNotice = { id: string; title: string; body: string; at: string }

type State = {
  authReady: boolean
  user: { uid: string; email: string } | null
  me: Me | null
  error: string | null
  summaries: Record<string, SpaceSummary>
  spaceData: Record<
    string,
    { policy: BookingPolicy; appointments: Appointment[]; voucherNotices?: VoucherNotice[] }
  >
  prefs: Prefs
}

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'https://luminix-api.fly.dev').replace(
  /\/$/,
  '',
)
const DEFAULT_PREFS: Prefs = {
  language: 'pt-BR',
  notify: { reminders: true, promotions: true },
  activeSlug: null,
  read: [],
  hidden: [],
}
const INITIAL: State = {
  authReady: false,
  user: null,
  me: null,
  error: null,
  summaries: {},
  spaceData: {},
  prefs: DEFAULT_PREFS,
}

let state: State = INITIAL
const listeners = new Set<() => void>()
let started = false
/** While sign-up writes the profile, the auth listener must not write a default one. */
let signingUp = false

function set(change: Partial<State>) {
  state = { ...state, ...change }
  listeners.forEach((listener) => listener())
}

const prefsKey = (email: string) => `luminix.cliente.prefs.${email}`

function readPrefs(email: string): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(prefsKey(email)) ?? 'null') as Partial<Prefs> | null
    return raw ? { ...DEFAULT_PREFS, ...raw } : DEFAULT_PREFS
  } catch {
    return DEFAULT_PREFS
  }
}

function savePrefs(change: Partial<Prefs>) {
  const prefs = { ...state.prefs, ...change }
  set({ prefs })
  try {
    if (state.user) localStorage.setItem(prefsKey(state.user.email), JSON.stringify(prefs))
  } catch {
    // Without storage the preference lasts for this visit only.
  }
}

/** Calls the client API as the signed-in person. Returns the parsed body or throws ApiError. */
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
    cache: 'no-store',
  })
  const data = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) throw new ApiError(response.status, data.error ?? 'Request failed')
  return data as T
}

const messages: Record<string, string> = {
  'Service unavailable':
    'Este serviço está sem disponibilidade nessa data. Consulte os dias de locação.',
  'Slot taken': 'Esse horário acabou de ser ocupado. Escolha outro.',
  'Booking paused':
    'O agendamento online deste espaço está pausado no momento. Fale direto com o espaço para marcar.',
  'Cancellation closed': 'O prazo para cancelar pelo app já passou. Fale com o espaço.',
  'Rescheduling closed': 'O prazo para remarcar pelo app já passou. Fale com o espaço.',
  'Too many requests': 'Muitas tentativas seguidas. Aguarde um minuto.',
  'Space not linked': 'Este espaço não está mais na sua conta.',
  'Record required': 'Complete a ficha que este espaço pede antes de agendar.',
  'Record expired': 'Sua ficha venceu. Confirme seus dados para agendar de novo.',
  'Payment unavailable': 'Este espaço recebe o pagamento no dia do atendimento.',
  'Pix unavailable': 'Este espaço ainda não recebe Pix pelo app. Escolha cartão ou pague no local.',
  'Pay at the clinic':
    'Para horários tão próximos, o pagamento é feito no espaço. Escolha "pagar no local".',
  'Payment closed': 'O prazo para pagar este horário acabou. Agende de novo.',
  'Contact the space': 'Este horário já foi pago pelo app. Para cancelar, fale com o espaço.',
  'Deposit unavailable': 'O prazo do sinal acabou. Agende de novo ou fale com o espaço.',
  'Appointment closed': 'Este horário já passou ou foi encerrado.',
  'Deposit required': 'Este serviço pede um sinal para reservar o horário. Escolha como pagar.',
}

function friendly(error: unknown) {
  if (error instanceof ApiError)
    return messages[error.code] ?? 'Não foi possível concluir. Tente de novo.'
  return 'Sem conexão com o Luminix. Verifique a internet e tente de novo.'
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

async function fetchSummary(slug: string): Promise<SpaceSummary | null> {
  try {
    const response = await fetch(`/api/espacos/${encodeURIComponent(slug)}`)
    if (!response.ok) return null
    return ((await response.json()) as { summary: SpaceSummary }).summary
  } catch {
    return null
  }
}

function toAnamnesis(record: ApiAnamnesis | null, photo: string | null): Anamnesis | null {
  return normalizeRecord(record, photo)
}

const statusMap: Record<ApiAppointment['status'], Appointment['status']> = {
  scheduled: 'requested',
  confirmed: 'confirmed',
  completed: 'done',
  canceled: 'cancelled',
  no_show: 'cancelled',
}

function toLocal(iso: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

function toAppointment(row: ApiAppointment): Appointment {
  return {
    id: row.id,
    rentalDates: row.rentalDates,
    canceledBySpace: row.canceledBySpace === true,
    cancelReason: row.cancelReason ?? null,
    serviceId: row.service.id,
    serviceName: row.service.name,
    category: row.service.category ?? '',
    start: `${row.start.date}T${row.start.clock}`,
    durationMinutes: Math.round(
      (new Date(row.endsAt).getTime() - new Date(row.startsAt).getTime()) / 60_000,
    ),
    priceCents: row.priceCents ?? 0,
    status: statusMap[row.status],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    source: row.source,
    professionalId: row.professional?.id ?? null,
    professionalName: row.professional?.name ?? null,
    previousStart: row.previousStartsAt ? toLocal(row.previousStartsAt) : null,
    rescheduledAt: row.rescheduledAt,
    paymentMethod: row.paymentMethod,
    paid: row.paid,
    paidCents: row.paidCents ?? 0,
    // Older API answers lack it: the client's own bookings are confirmed by her.
    presenceConfirmed: row.presenceConfirmed ?? row.source === 'client',
    deposit: row.deposit ?? null,
    onlinePayment: row.onlinePayment
      ? {
          ...row.onlinePayment,
          kind: row.onlinePayment.kind ?? 'full',
          amountCents: row.onlinePayment.amountCents ?? null,
        }
      : null,
  }
}

/** Payments: Pix/card in the app count once Stripe confirms them (ADR-040); at the space, when
 * the clinic records them. */
function paymentsOf(appointments: Appointment[]): Payment[] {
  return appointments
    .filter((item) => item.priceCents > 0)
    .flatMap((item): Payment[] => {
      const method = item.paymentMethod ?? 'local'
      const online = item.onlinePayment?.status
      if (online === 'expired' || online === 'refunded') return []
      if (item.status === 'cancelled' && !item.paid) return []
      // Deposit paid in the app (ADR-042): the deposit, then the rest owed at the space.
      if (online === 'paid' && item.onlinePayment?.kind === 'deposit') {
        const deposit = item.onlinePayment.amountCents ?? item.deposit?.cents ?? 0
        return [
          {
            id: `deposit-${item.id}`,
            appointmentId: item.id,
            label: `Sinal · ${item.serviceName}`,
            amountCents: deposit,
            method,
            status: 'paid',
            at: item.createdAt,
            receipt: true,
          },
          ...(item.priceCents > deposit
            ? [
                {
                  id: `rest-${item.id}`,
                  appointmentId: item.id,
                  label: `Restante · ${item.serviceName}`,
                  amountCents: item.priceCents - deposit,
                  method: 'local' as const,
                  status: item.paid ? ('paid' as const) : ('pending' as const),
                  at: item.createdAt,
                },
              ]
            : []),
        ]
      }
      return [
        {
          id: `pay-${item.id}`,
          appointmentId: item.id,
          label: item.serviceName,
          amountCents: item.priceCents,
          method,
          status: item.paid || online === 'paid' ? 'paid' : 'pending',
          at: item.createdAt,
          receipt: online === 'paid',
        },
      ]
    })
}

const short = (start: string) =>
  `${start.slice(8, 10)}/${start.slice(5, 7)} às ${start.slice(11, 16)}`

/** Notices derived from what the space did with the client's appointments. */
function noticesOf(link: { summary: SpaceSummary; linkedAt: string }, appointments: Appointment[]) {
  const now = Date.now()
  const list: Omit<Notice, 'read'>[] = [
    {
      id: `welcome-${link.summary.slug}`,
      kind: 'space',
      title: `Você entrou em ${link.summary.name}`,
      body: 'Conheça os serviços e marque seu horário quando quiser.',
      at: link.linkedAt,
      href: '/cliente/servicos',
    },
  ]
  for (const item of appointments) {
    const when = new Date(`${item.start}:00-03:00`).getTime()
    if (item.status === 'cancelled') {
      if (now - new Date(item.updatedAt).getTime() < 30 * 86_400_000)
        list.push({
          id: `cancel-${item.id}`,
          kind: 'booking',
          title: item.canceledBySpace ? 'O espaço cancelou seu horário' : 'Horário cancelado',
          body: item.canceledBySpace
            ? `${item.serviceName} de ${short(item.start)} foi cancelado pelo espaço.${item.cancelReason ? ` ${item.cancelReason}` : ''} Escolha um novo horário quando puder.`
            : `${item.serviceName} de ${short(item.start)} foi cancelado.`,
          at: item.updatedAt,
          href: '/cliente/agenda',
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
        href: '/cliente/agenda',
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
      href: '/cliente/agenda',
    })
    if (when - now < 48 * 3_600_000)
      list.push({
        id: `reminder-${item.id}-${item.start}`,
        kind: 'booking',
        title: 'Lembrete de horário',
        body: `${item.serviceName} ${when - now < 24 * 3_600_000 ? 'hoje ou amanhã' : 'em breve'}, ${short(item.start)}.`,
        at: new Date(
          Math.max(when - 48 * 3_600_000, new Date(item.createdAt).getTime()),
        ).toISOString(),
        href: '/cliente/agenda',
      })
  }
  return list.sort((a, b) => b.at.localeCompare(a.at))
}

let cachedAccount: { key: unknown[]; value: Account | null } | null = null

/** Builds the screen model; memoized so React sees a stable object between changes. */
function accountOf(current: State): Account | null {
  const key = [current.user, current.me, current.summaries, current.spaceData, current.prefs]
  if (cachedAccount && cachedAccount.key.every((value, index) => value === key[index]))
    return cachedAccount.value
  let value: Account | null = null
  if (current.user && current.me?.profile) {
    const profile = current.me.profile
    const read = new Set(current.prefs.read)
    const hidden = new Set(current.prefs.hidden ?? [])
    const spaces: Record<string, SpaceLink> = {}
    for (const link of current.me.spaces) {
      const summary = current.summaries[link.slug]
      if (!summary) continue
      const data = current.spaceData[link.slug]
      const appointments = data?.appointments ?? []
      spaces[link.slug] = {
        summary,
        linkedAt: link.linkedAt,
        shareAnamnesis: link.shareAnamnesis,
        anamnesis: toAnamnesis(link.ownAnamnesis, link.ownPhoto),
        requiredLevel: link.requiredLevel ?? 1,
        loaded: Boolean(data),
        policy: data?.policy ?? null,
        appointments,
        payments: paymentsOf(appointments),
        notices: [
          ...noticesOf({ summary, linkedAt: link.linkedAt }, appointments),
          ...(data?.voucherNotices ?? []).map((item) => ({ ...item, kind: 'promo' as const })),
        ]
          .filter((item) => !hidden.has(item.id))
          .sort((a, b) => b.at.localeCompare(a.at))
          .map((item) => ({ ...item, read: read.has(item.id) })),
      }
    }
    // A new device has no preference yet: the oldest linked space opens.
    const activeSlug =
      current.prefs.activeSlug && spaces[current.prefs.activeSlug]
        ? current.prefs.activeSlug
        : (current.me.spaces.find((item) => spaces[item.slug])?.slug ?? null)
    value = {
      email: profile.email ?? current.user.email,
      name: profile.name ?? '',
      phone: profile.phone ?? '',
      createdAt: profile.createdAt,
      language: current.prefs.language,
      notify: current.prefs.notify,
      anamnesis: toAnamnesis(profile.anamnesis, profile.photo),
      activeSlug,
      spaces,
    }
  }
  cachedAccount = { key, value }
  return value
}

async function refreshMe() {
  const me = await api<Me>('/client/me')
  const missing = me.spaces.map((item) => item.slug).filter((slug) => !state.summaries[slug])
  const found = await Promise.all(missing.map(fetchSummary))
  const summaries = { ...state.summaries }
  found.forEach((summary, index) => {
    if (summary) summaries[missing[index]] = summary
  })
  set({ me, summaries, error: null })
  const active = me.spaces.some((item) => item.slug === state.prefs.activeSlug)
    ? state.prefs.activeSlug
    : me.spaces[0]?.slug
  if (active) await refreshSpace(active)
}

export async function refreshSpace(slug: string) {
  try {
    const data = await api<{
      policy: BookingPolicy
      appointments: ApiAppointment[]
      voucherNotices?: VoucherNotice[]
    }>(`/client/spaces/${encodeURIComponent(slug)}/appointments`)
    set({
      spaceData: {
        ...state.spaceData,
        [slug]: {
          policy: data.policy,
          appointments: data.appointments.map(toAppointment),
          voucherNotices: data.voucherNotices,
        },
      },
    })
  } catch {
    // Keeps what was shown; the next action or visit tries again.
  }
}

async function onUser(user: User | null) {
  if (!user) {
    cachedAccount = null
    set({ authReady: true, user: null, me: null, spaceData: {}, prefs: DEFAULT_PREFS })
    return
  }
  const email = user.email ?? ''
  set({ user: { uid: user.uid, email }, prefs: readPrefs(email) })
  try {
    await refreshMe()
    // A Luminix account without a client profile yet (e.g. staff): start one from the login.
    if (!state.me?.profile && !signingUp) {
      await api('/client/me', {
        method: 'PUT',
        body: { name: user.displayName || email.split('@')[0] || 'Cliente', email },
      })
      await refreshMe()
    }
  } catch (error) {
    set({ error: friendly(error) })
  }
  set({ authReady: true })
}

function start() {
  if (started || typeof window === 'undefined') return
  started = true
  try {
    onAuthStateChanged(clientAuth(), (user) => void onUser(user))
  } catch {
    set({ authReady: true, error: 'Login indisponível neste ambiente.' })
  }
}

function subscribe(listener: () => void) {
  start()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useClient() {
  const current = useSyncExternalStore(
    subscribe,
    () => state,
    () => INITIAL,
  )
  const ready =
    current.authReady && (!current.user || Boolean(current.me) || Boolean(current.error))
  const account = accountOf(current)
  const space = account?.activeSlug ? (account.spaces[account.activeSlug] ?? null) : null
  /** The record the active space reads: the account one when shared, else its own. */
  const anamnesis = !account
    ? null
    : space && !space.shareAnamnesis
      ? space.anamnesis
      : account.anamnesis
  return { ready, account, space, anamnesis, error: current.error }
}

export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)

export async function signUp(input: {
  name: string
  email: string
  phone: string
  password: string
}): Promise<string | null> {
  const email = input.email.trim().toLowerCase()
  if (input.name.trim().length < 2) return 'Informe seu nome.'
  if (!isEmail(email)) return 'Informe um e-mail válido.'
  if (input.password.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.'
  const digits = input.phone.replace(/\D/g, '')
  if (digits && digits.length < 10) return 'Confira o celular com DDD.'
  signingUp = true
  try {
    await createUserWithEmailAndPassword(clientAuth(), email, input.password)
  } catch (error) {
    signingUp = false
    return firebaseMessage(error)
  }
  try {
    await api('/client/me', {
      method: 'PUT',
      body: { name: input.name.trim(), email, ...(digits ? { phone: digits } : {}) },
    })
    await refreshMe()
    return null
  } catch (error) {
    return friendly(error)
  } finally {
    signingUp = false
  }
}

export async function signIn(emailInput: string, password: string): Promise<string | null> {
  try {
    await signInWithEmailAndPassword(clientAuth(), emailInput.trim().toLowerCase(), password)
    return null
  } catch (error) {
    return firebaseMessage(error)
  }
}

export async function resetPassword(emailInput: string): Promise<string | null> {
  const email = emailInput.trim().toLowerCase()
  if (!isEmail(email)) return 'Digite seu e-mail para receber o link.'
  try {
    await sendPasswordResetEmail(clientAuth(), email)
  } catch (error) {
    const code = (error as { code?: string })?.code ?? ''
    // Never reveal whether an e-mail has an account.
    if (!code.includes('user-not-found')) return firebaseMessage(error)
  }
  return null
}

export function signOut() {
  void firebaseSignOut(clientAuth())
}

export async function updateAccount(
  patch: Partial<Pick<Account, 'name' | 'phone' | 'language' | 'notify'>>,
): Promise<string | null> {
  if (patch.language || patch.notify)
    savePrefs({
      ...(patch.language ? { language: patch.language } : {}),
      ...(patch.notify ? { notify: patch.notify } : {}),
    })
  if (patch.name === undefined && patch.phone === undefined) return null
  const profile = state.me?.profile
  const digits = (patch.phone ?? profile?.phone ?? '').replace(/\D/g, '')
  try {
    await api('/client/me', {
      method: 'PUT',
      body: {
        name: (patch.name ?? profile?.name ?? '').trim(),
        email: profile?.email ?? state.user?.email ?? '',
        ...(digits ? { phone: digits } : {}),
      },
    })
    await refreshMe()
    return null
  } catch (error) {
    return error instanceof ApiError && error.code === 'Invalid phone'
      ? 'Confira o celular com DDD.'
      : friendly(error)
  }
}

export async function changePassword(current: string, next: string): Promise<string | null> {
  const user = clientAuth().currentUser
  if (!user?.email) return 'Sessão encerrada. Entre de novo.'
  if (next.length < 8) return 'A nova senha precisa ter pelo menos 8 caracteres.'
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current))
  } catch {
    return 'Senha atual incorreta.'
  }
  try {
    await updatePassword(user, next)
    return null
  } catch (error) {
    return firebaseMessage(error)
  }
}

/** Links (or reopens) a space on the server and makes it the active one. */
export async function linkSpace(summary: SpaceSummary, shareAnamnesis: boolean) {
  try {
    await api('/client/spaces', { method: 'POST', body: { slug: summary.slug, shareAnamnesis } })
    set({ summaries: { ...state.summaries, [summary.slug]: summary } })
    savePrefs({ activeSlug: summary.slug })
    await refreshMe()
    return null
  } catch (error) {
    return friendly(error)
  }
}

export function setActiveSpace(slug: string) {
  savePrefs({ activeSlug: slug })
  if (!state.spaceData[slug]) void refreshSpace(slug)
}

export async function unlinkSpace(slug: string) {
  try {
    await api(`/client/spaces/${encodeURIComponent(slug)}`, { method: 'DELETE' })
    if (state.prefs.activeSlug === slug) savePrefs({ activeSlug: null })
    await refreshMe()
    return null
  } catch (error) {
    return friendly(error)
  }
}

/** `slug` null saves the account record; a slug saves that space's own record. */
export async function saveAnamnesis(
  slug: string | null,
  record: { level: Level; answers: Answers; photo: string },
) {
  try {
    await api(
      slug ? `/client/spaces/${encodeURIComponent(slug)}/anamnesis` : '/client/me/anamnesis',
      { method: 'PUT', body: { ...record, consent: true } },
    )
    await refreshMe()
    return null
  } catch (error) {
    return friendly(error)
  }
}

export async function loadAvailability(
  slug: string,
  serviceId: string,
  date: string,
  ignore?: string,
): Promise<Availability | null> {
  try {
    const query = new URLSearchParams({ serviceId, date, ...(ignore ? { ignore } : {}) })
    return await api<Availability>(
      `/client/spaces/${encodeURIComponent(slug)}/availability?${query}`,
    )
  } catch {
    return null
  }
}

export async function book(
  slug: string,
  input: { serviceId: string; professionalId: string | null; start: string },
  method: Payment['method'],
  /** In the app: the whole visit or only the deposit (ADR-042). */
  payAmount: 'full' | 'deposit' = 'full',
): Promise<{
  error: string | null
  status?: 'confirmed' | 'scheduled'
  id?: string
  deposit?: Deposit | null
  /** Stripe page to pay now (Pix or card in the app). */
  paymentUrl?: string | null
}> {
  try {
    const result = await api<{
      id: string
      status: 'confirmed' | 'scheduled'
      deposit?: Deposit | null
      payment?: { url: string } | null
    }>(`/client/spaces/${encodeURIComponent(slug)}/appointments`, {
      method: 'POST',
      body: {
        serviceId: input.serviceId,
        ...(input.professionalId ? { professionalId: input.professionalId } : {}),
        localStartsAt: input.start,
        paymentMethod: method,
        // This app shows the space's Pix code when the service asks for a deposit.
        ...(method === 'local' ? { deposit: 'pix' } : { payAmount }),
      },
    })
    await refreshSpace(slug)
    return {
      error: null,
      status: result.status,
      id: result.id,
      deposit: result.deposit ?? null,
      paymentUrl: result.payment?.url ?? null,
    }
  } catch (error) {
    return { error: friendly(error) }
  }
}

export async function reschedule(slug: string, appointmentId: string, start: string) {
  try {
    await api(
      `/client/spaces/${encodeURIComponent(slug)}/appointments/${appointmentId}/reschedule`,
      {
        method: 'POST',
        body: { localStartsAt: start },
      },
    )
    await refreshSpace(slug)
    return null
  } catch (error) {
    return friendly(error)
  }
}

/** Back to an unfinished payment: the open Stripe page, or an error when the time ran out. */
export async function resumePayment(slug: string, appointmentId: string) {
  try {
    const result = await api<{ url: string }>(
      `/client/spaces/${encodeURIComponent(slug)}/appointments/${appointmentId}/payment`,
      { method: 'POST' },
    )
    return { url: result.url, error: null }
  } catch (error) {
    await refreshSpace(slug)
    return { url: null, error: friendly(error) }
  }
}

const packageCache = new Map<string, Promise<SpacePackage[] | null>>()
/** Packages of the space; remembered for the visit, a failure is tried again next time. */
export function loadPackages(slug: string) {
  let pending = packageCache.get(slug)
  if (!pending) {
    pending = api<{ packages: SpacePackage[] }>(
      `/client/spaces/${encodeURIComponent(slug)}/packages`,
    )
      .then((data) => data.packages)
      .catch(() => null)
    packageCache.set(slug, pending)
    void pending.then((value) => {
      if (!value) packageCache.delete(slug)
    })
  }
  return pending
}

/** Stripe's receipt of a payment made in the app. */
export async function paymentReceipt(slug: string, appointmentId: string) {
  try {
    const result = await api<{ url: string }>(
      `/client/spaces/${encodeURIComponent(slug)}/appointments/${appointmentId}/receipt`,
    )
    return { url: result.url, error: null }
  } catch (error) {
    return {
      url: null,
      error:
        error instanceof ApiError && error.code === 'Receipt unavailable'
          ? 'O comprovante ainda não está disponível. Tente de novo em instantes.'
          : friendly(error),
    }
  }
}

/** "Já paguei": the hold stops expiring; the space confirms after checking the bank. */
export async function reportDeposit(slug: string, appointmentId: string) {
  try {
    await api(
      `/client/spaces/${encodeURIComponent(slug)}/appointments/${appointmentId}/deposit-paid`,
      { method: 'POST' },
    )
    await refreshSpace(slug)
    return null
  } catch (error) {
    return friendly(error)
  }
}

export async function cancelAppointment(slug: string, appointmentId: string) {
  try {
    await api(`/client/spaces/${encodeURIComponent(slug)}/appointments/${appointmentId}/cancel`, {
      method: 'POST',
    })
    await refreshSpace(slug)
    return null
  } catch (error) {
    return friendly(error)
  }
}

export function markNoticesRead(slug: string, noticeId?: string) {
  const space = accountOf(state)?.spaces[slug]
  if (!space) return
  const ids = noticeId ? [noticeId] : space.notices.map((item) => item.id)
  // Bounded: old ids fall off; they would no longer be listed anyway.
  savePrefs({ read: [...new Set([...state.prefs.read, ...ids])].slice(-400) })
}

/** Deletes notices from this device (one, or all the ones given). */
export function deleteNotices(ids: string[]) {
  if (!ids.length) return
  savePrefs({ hidden: [...new Set([...(state.prefs.hidden ?? []), ...ids])].slice(-600) })
}

/** "Vou, sim": the client confirms a visit the space booked for her (ADR-043). */
export async function confirmPresence(slug: string, appointmentId: string) {
  try {
    await api(`/client/spaces/${encodeURIComponent(slug)}/appointments/${appointmentId}/confirm`, {
      method: 'POST',
    })
    await refreshSpace(slug)
    return null
  } catch (error) {
    return friendly(error)
  }
}

/** Space the visitor came from (site button), kept until a session can link it. */
const PENDING = 'luminix.cliente.espaco'
export function rememberPendingSpace(slug: string) {
  try {
    sessionStorage.setItem(PENDING, slug)
  } catch {
    // Without sessionStorage the visitor just picks the space manually.
  }
}
export function takePendingSpace() {
  try {
    const slug = sessionStorage.getItem(PENDING)
    sessionStorage.removeItem(PENDING)
    return slug
  } catch {
    return null
  }
}
export function peekPendingSpace() {
  try {
    return sessionStorage.getItem(PENDING)
  } catch {
    return null
  }
}
