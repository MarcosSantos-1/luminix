'use client'

// Device-only persistence for the client area. There is no client identity in the API yet
// (ADR-027: e-mail + senha, pendente), so nothing here leaves the browser. Every screen goes
// through these actions; replacing their bodies with API calls is the migration path.

import { useSyncExternalStore } from 'react'
import type {
  Account,
  Anamnesis,
  Appointment,
  Notice,
  Payment,
  SpaceLink,
  SpaceSummary,
} from './types'
import { addDays, dayKey } from './format'

type State = { session: string | null; accounts: Record<string, Account> }

const KEY = 'luminix.cliente.v1'
const EMPTY: State = { session: null, accounts: {} }
const listeners = new Set<() => void>()
let state: State | undefined

function read(): State {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? 'null') as State | null
    if (parsed && typeof parsed === 'object' && parsed.accounts) {
      // Records saved before the account-level anamnesis: the first space record becomes it.
      for (const account of Object.values(parsed.accounts)) {
        const spaces = Object.values(account.spaces)
        account.anamnesis ??= spaces.find((space) => space.anamnesis)?.anamnesis ?? null
        for (const space of spaces) space.shareAnamnesis ??= !space.anamnesis
      }
      return parsed
    }
  } catch {
    // Corrupt or blocked storage: start empty rather than break the app.
  }
  return EMPTY
}

function snapshot() {
  return (state ??= read())
}

function commit(next: State) {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Quota or private mode: the session keeps working in memory.
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY) return
    state = read()
    listener()
  }
  listeners.add(listener)
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

const noop = () => () => {}

export function useClient() {
  const current = useSyncExternalStore(subscribe, snapshot, () => EMPTY)
  const ready = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  )
  const account = current.session ? (current.accounts[current.session] ?? null) : null
  const space = account?.activeSlug ? (account.spaces[account.activeSlug] ?? null) : null
  /** The record the active space reads: the account one when shared, else its own. */
  const anamnesis = !account
    ? null
    : space && !space.shareAnamnesis
      ? space.anamnesis
      : account.anamnesis
  return { ready, account, space, anamnesis }
}

const id = () => crypto.randomUUID()
const nowIso = () => new Date().toISOString()

async function hash(salt: string, password: string) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${salt}:${password}`),
  )
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function patchAccount(change: (account: Account) => Account) {
  const current = snapshot()
  const account = current.session && current.accounts[current.session]
  if (!account) return
  commit({ ...current, accounts: { ...current.accounts, [account.email]: change(account) } })
}

function patchSpace(slug: string, change: (space: SpaceLink) => SpaceLink) {
  patchAccount((account) =>
    account.spaces[slug]
      ? { ...account, spaces: { ...account.spaces, [slug]: change(account.spaces[slug]) } }
      : account,
  )
}

function notice(input: Omit<Notice, 'id' | 'at' | 'read'>): Notice {
  return { ...input, id: id(), at: nowIso(), read: false }
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
  const current = snapshot()
  if (current.accounts[email]) return 'Já existe uma conta com este e-mail neste aparelho.'
  const salt = id()
  const account: Account = {
    email,
    name: input.name.trim(),
    phone: input.phone.trim(),
    passHash: await hash(salt, input.password),
    salt,
    createdAt: nowIso(),
    language: 'pt-BR',
    notify: { reminders: true, promotions: true },
    anamnesis: null,
    activeSlug: null,
    spaces: {},
  }
  commit({ session: email, accounts: { ...current.accounts, [email]: account } })
  return null
}

export async function signIn(emailInput: string, password: string): Promise<string | null> {
  const email = emailInput.trim().toLowerCase()
  const current = snapshot()
  const account = current.accounts[email]
  // Same message for unknown e-mail and wrong password.
  if (!account || (await hash(account.salt, password)) !== account.passHash)
    return 'E-mail ou senha incorretos.'
  commit({ ...current, session: email })
  return null
}

export function signOut() {
  commit({ ...snapshot(), session: null })
}

export function updateAccount(
  patch: Partial<Pick<Account, 'name' | 'phone' | 'language' | 'notify'>>,
) {
  patchAccount((account) => ({ ...account, ...patch }))
}

export async function changePassword(current: string, next: string): Promise<string | null> {
  const stored = snapshot()
  const account = stored.session && stored.accounts[stored.session]
  if (!account) return 'Sessão encerrada.'
  if ((await hash(account.salt, current)) !== account.passHash) return 'Senha atual incorreta.'
  if (next.length < 8) return 'A nova senha precisa ter pelo menos 8 caracteres.'
  const salt = id()
  const passHash = await hash(salt, next)
  patchAccount((value) => ({ ...value, salt, passHash }))
  return null
}

/** Links (or refreshes) a space and makes it the active one. */
export function linkSpace(summary: SpaceSummary, shareAnamnesis: boolean) {
  patchAccount((account) => {
    const existing = account.spaces[summary.slug]
    const space: SpaceLink = existing
      ? { ...existing, summary }
      : {
          summary,
          linkedAt: nowIso(),
          shareAnamnesis,
          anamnesis: null,
          appointments: [],
          payments: [],
          notices: [
            notice({
              kind: 'space',
              title: `Você entrou em ${summary.name}`,
              body: 'Conheça os serviços e marque seu primeiro horário quando quiser.',
              href: '/cliente/servicos',
            }),
          ],
        }
    return {
      ...account,
      activeSlug: summary.slug,
      spaces: { ...account.spaces, [summary.slug]: space },
    }
  })
}

export function setActiveSpace(slug: string) {
  patchAccount((account) => (account.spaces[slug] ? { ...account, activeSlug: slug } : account))
}

export function unlinkSpace(slug: string) {
  patchAccount((account) => {
    const spaces = { ...account.spaces }
    delete spaces[slug]
    return {
      ...account,
      spaces,
      activeSlug:
        account.activeSlug === slug ? (Object.keys(spaces)[0] ?? null) : account.activeSlug,
    }
  })
}

/** `slug` null saves the account record; a slug saves that space's own record. */
export function saveAnamnesis(slug: string | null, anamnesis: Anamnesis) {
  if (slug) patchSpace(slug, (space) => ({ ...space, anamnesis, shareAnamnesis: false }))
  else patchAccount((account) => ({ ...account, anamnesis }))
}

export function setAnamnesisSharing(slug: string, shareAnamnesis: boolean) {
  patchSpace(slug, (space) => ({ ...space, shareAnamnesis }))
}

export function book(
  slug: string,
  input: Pick<
    Appointment,
    'serviceId' | 'serviceName' | 'category' | 'start' | 'durationMinutes' | 'priceCents' | 'status'
  >,
  method: Payment['method'],
) {
  const appointment: Appointment = { ...input, id: id(), createdAt: nowIso() }
  patchSpace(slug, (space) => ({
    ...space,
    appointments: [...space.appointments, appointment],
    payments:
      input.priceCents > 0
        ? [
            ...space.payments,
            {
              id: id(),
              appointmentId: appointment.id,
              label: input.serviceName,
              amountCents: input.priceCents,
              method,
              status: method === 'local' ? 'pending' : 'paid',
              at: nowIso(),
            },
          ]
        : space.payments,
    notices: [
      notice({
        kind: 'booking',
        title: input.status === 'confirmed' ? 'Horário confirmado' : 'Pedido de horário enviado',
        body: `${input.serviceName} em ${input.start.slice(8, 10)}/${input.start.slice(5, 7)} às ${input.start.slice(11, 16)}.`,
        href: '/cliente/agenda',
      }),
      ...space.notices,
    ],
  }))
  return appointment.id
}

export function reschedule(slug: string, appointmentId: string, start: string) {
  patchSpace(slug, (space) => ({
    ...space,
    appointments: space.appointments.map((item) =>
      item.id === appointmentId ? { ...item, start } : item,
    ),
    notices: [
      notice({
        kind: 'booking',
        title: 'Horário remarcado',
        body: `Novo horário: ${start.slice(8, 10)}/${start.slice(5, 7)} às ${start.slice(11, 16)}.`,
        href: '/cliente/agenda',
      }),
      ...space.notices,
    ],
  }))
}

export function cancelAppointment(slug: string, appointmentId: string) {
  patchSpace(slug, (space) => {
    const target = space.appointments.find((item) => item.id === appointmentId)
    return {
      ...space,
      appointments: space.appointments.map((item) =>
        item.id === appointmentId ? { ...item, status: 'cancelled' as const } : item,
      ),
      // A paid booking is refunded; one that would be paid at the space just disappears.
      payments: space.payments
        .filter(
          (payment) => !(payment.appointmentId === appointmentId && payment.status === 'pending'),
        )
        .map((payment): Payment =>
          payment.appointmentId === appointmentId && payment.status === 'paid'
            ? { ...payment, status: 'refunded' }
            : payment,
        ),
      notices: target
        ? [
            notice({
              kind: 'booking',
              title: 'Horário cancelado',
              body: `${target.serviceName} foi cancelado.`,
              href: '/cliente/agenda',
            }),
            ...space.notices,
          ]
        : space.notices,
    }
  })
}

export function markNoticesRead(slug: string, noticeId?: string) {
  patchSpace(slug, (space) => ({
    ...space,
    notices: space.notices.map((item) =>
      !noticeId || item.id === noticeId ? { ...item, read: true } : item,
    ),
  }))
}

/** Sample history so the screens can be reviewed before real data exists. */
export function seedExamples(
  slug: string,
  services: {
    id: string
    name: string
    category: string
    durationMinutes: number
    priceCents: number
  }[],
) {
  if (!services.length) return
  const today = new Date()
  const pick = (index: number) => services[index % services.length]
  const make = (offset: number, time: string, index: number, status: Appointment['status']) => {
    const service = pick(index)
    const appointment: Appointment = {
      id: id(),
      serviceId: service.id,
      serviceName: service.name,
      category: service.category,
      start: `${dayKey(addDays(today, offset))}T${time}`,
      durationMinutes: service.durationMinutes,
      priceCents: service.priceCents,
      status,
      createdAt: addDays(today, Math.min(offset, 0) - 3).toISOString(),
    }
    return appointment
  }
  const appointments = [
    make(-62, '10:00', 0, 'done'),
    make(-34, '15:30', 1, 'done'),
    make(-20, '09:30', 2, 'cancelled'),
    make(-6, '14:00', 0, 'done'),
    make(2, '11:00', 1, 'confirmed'),
    make(9, '16:30', 3, 'requested'),
  ]
  const payments: Payment[] = appointments
    .filter((item) => item.priceCents > 0 && item.status !== 'requested')
    .map((item, index) => ({
      id: id(),
      appointmentId: item.id,
      label: item.serviceName,
      amountCents: item.priceCents,
      method: index % 2 ? 'card' : 'pix',
      status: item.status === 'cancelled' ? 'refunded' : 'paid',
      at: item.createdAt,
    }))
  patchSpace(slug, (space) => ({
    ...space,
    appointments: [...space.appointments, ...appointments],
    payments: [...space.payments, ...payments],
    notices: [
      notice({
        kind: 'booking',
        title: 'Lembrete de horário',
        body: `${appointments[4].serviceName} em 2 dias, às 11:00.`,
        href: '/cliente/agenda',
      }),
      notice({
        kind: 'promo',
        title: 'Condição especial desta semana',
        body: 'Veja os serviços com valor promocional no espaço.',
        href: '/cliente/servicos',
      }),
      notice({
        kind: 'app',
        title: 'Dados de exemplo carregados',
        body: 'Atendimentos e pagamentos fictícios para você avaliar as telas.',
      }),
      ...space.notices,
    ],
  }))
}

export function wipeDevice() {
  commit(EMPTY)
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
