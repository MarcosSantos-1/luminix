import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import {
  PixUnavailableError,
  type ConnectPaymentEvent,
  type OnlinePaymentsProvider,
} from '../src/modules/payments/online-checkout.js'
import type { ConnectProvider } from '../src/modules/payments/stripe-connect.js'
import { applyMigrations, type SqlConnection } from '../src/shared/database/migrations.js'

// ADR-040: the client pays the visit in the app, on the clinic's Connect account. The slot is
// held until paid; only signed Connect webhooks confirm the payment and create the income.
let db: PGlite
let connection: SqlConnection
let clinic: string
let slug: string
let service: string
let sessions = 0
let pixWorks = true
let ready = true

const connect: ConnectProvider = {
  context: async () => ({
    platformAccountId: 'acct_platform1',
    livemode: false,
    publishableKey: 'pk_test_x',
  }),
  create: async () => 'acct_unused',
  status: async () => ({
    state: ready ? 'active' : 'pending',
    chargesEnabled: ready,
    payoutsEnabled: ready,
    requirementsDue: ready ? 0 : 2,
    testMode: true,
  }),
  session: async () => 'secret',
}

const online: OnlinePaymentsProvider = {
  createCheckout: async ({ method, account }) => {
    if (method === 'pix' && !pixWorks) throw new PixUnavailableError()
    sessions += 1
    return { id: `cs_test_${sessions}`, url: `https://checkout.stripe.test/${account}/${sessions}` }
  },
  openUrl: async (_account, session) => `https://checkout.stripe.test/again/${session}`,
  readEvent: (raw, signature) => {
    if (signature !== 'ok') throw new Error('bad signature')
    return JSON.parse(raw.toString('utf8')) as ConnectPaymentEvent
  },
}

async function call(
  user: string | null,
  method: 'GET' | 'POST' | 'PUT',
  url: string,
  payload?: object,
) {
  const app = await buildApp(
    {},
    {
      database: connection,
      tenantPool: { connect: async () => ({ ...connection, release: () => {} }) },
      verifyToken: async (token) => ({ uid: token }),
      connectProvider: connect,
      onlinePayments: online,
    },
  )
  try {
    return await app.inject({
      method,
      url,
      headers: {
        ...(user ? { authorization: `Bearer ${user}` } : {}),
        ...(user === null ? { 'stripe-signature': 'ok' } : {}),
      },
      ...(payload ? { payload } : {}),
    })
  } finally {
    await app.close()
  }
}

const sql = async (text: string, values: unknown[] = []) =>
  (await db.query<Record<string, unknown>>(text, values)).rows

async function asOwner<T>(work: () => Promise<T>) {
  await db.exec('RESET ROLE')
  try {
    return await work()
  } finally {
    await db.exec('SET ROLE luminix_api')
  }
}

const used = new Set<string>()
/** A different weekday for every booking (two weekend days must not land on one Monday). */
function nextWeekday() {
  for (let offset = 2; ; offset++) {
    const date = new Date(Date.now() + offset * 86_400_000)
    const key = date.toISOString().slice(0, 10)
    if ([0, 6].includes(date.getUTCDay()) || used.has(key)) continue
    used.add(key)
    return key
  }
}

const book = (paymentMethod: 'pix' | 'card' | 'local') =>
  call('ana-online', 'POST', `/client/spaces/${slug}/appointments`, {
    serviceId: service,
    localStartsAt: `${nextWeekday()}T09:00`,
    paymentMethod,
  })

const hook = (event: Partial<ConnectPaymentEvent>) =>
  call(null, 'POST', '/payments/stripe/webhook', {
    type: 'checkout.session.completed',
    account: 'acct_clinic1',
    intent: 'pi_123',
    outcome: 'paid',
    ...event,
  })

const visit = async (id: string) =>
  (
    await asOwner(() =>
      sql(
        `SELECT a.status, a.online_payment_status, a.cancellation_origin,
                luminix.appointment_paid_cents(a.clinic_id, a.id) AS paid
           FROM luminix.appointments a WHERE a.clinic_id = $1 AND a.id = $2`,
        [clinic, id],
      ),
    )
  )[0]

beforeAll(async () => {
  db = new PGlite()
  connection = {
    async query(text, values) {
      if (values) return db.query(text, values)
      const results = await db.exec(text)
      return { rows: results.at(-1)?.rows ?? [] }
    },
  }
  await applyMigrations(connection)
  const identity = (
    await connection.query('SELECT * FROM luminix.resolve_staff_identity($1)', ['dona-online'])
  ).rows[0].identity_id
  clinic = String(
    (
      await connection.query('SELECT * FROM luminix.bootstrap_owner_clinic($1::uuid, $2)', [
        identity,
        'Studio Online',
      ])
    ).rows[0].clinic_id,
  )
  slug = String(
    (
      await connection.query(
        "UPDATE luminix.clinics SET status = 'active' WHERE id = $1 RETURNING slug",
        [clinic],
      )
    ).rows[0].slug,
  )
  await connection.query("SELECT set_config('luminix.clinic_id', $1, false)", [clinic])
  await connection.query(
    `INSERT INTO luminix.clinic_profiles (clinic_id, owner_name, contact_email, contact_phone,
       public_enabled, anamnesis_level)
     VALUES ($1, 'Dona', 'dona@example.com', '+5511999999999', true, 1)`,
    [clinic],
  )
  for (let weekday = 1; weekday <= 5; weekday++)
    await connection.query(
      `INSERT INTO luminix.weekly_availability (clinic_id, weekday, is_available, periods)
       VALUES ($1, $2, true, '[{"start":"09:00","end":"13:00"}]')`,
      [clinic, weekday],
    )
  await connection.query(
    `INSERT INTO luminix.booking_policies (clinic_id, booking_notice_minutes, booking_window_days)
     VALUES ($1, 0, 60)`,
    [clinic],
  )
  await connection.query(
    `INSERT INTO luminix.payment_preferences (clinic_id, accept_in_app, provider)
     VALUES ($1, true, 'stripe_connect')`,
    [clinic],
  )
  await connection.query(
    `INSERT INTO luminix.stripe_connect_accounts
       (clinic_id, platform_account_id, livemode, account_id, connected_at)
     VALUES ($1, 'acct_platform1', false, 'acct_clinic1', now())`,
    [clinic],
  )
  service = String(
    (
      await connection.query(
        `INSERT INTO luminix.services (clinic_id, name, price_cents, duration_minutes, booking_mode)
         VALUES ($1, 'Limpeza de pele', 18000, 60, 'instant') RETURNING id`,
        [clinic],
      )
    ).rows[0].id,
  )
  await db.exec('SET ROLE luminix_api')
  await call('ana-online', 'PUT', '/client/me', {
    name: 'Ana Online',
    email: 'ana@example.com',
    phone: '(11) 98888-7777',
  })
  await call('ana-online', 'PUT', '/client/me/anamnesis', {
    level: 1,
    answers: { sex: 'female', birthDate: '1992-04-10', allergies: 'no', cosmeticAllergy: 'no' },
    photo: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2Q==',
    consent: true,
  })
  await call('ana-online', 'POST', '/client/spaces', { slug, shareAnamnesis: true })
})

afterAll(async () => {
  await db.close()
})

describe('pagamento do atendimento pelo app', () => {
  it('holds the slot, opens checkout on the clinic account and confirms only by webhook', async () => {
    const booked = await book('card')
    expect(booked.statusCode).toBe(201)
    const body = booked.json()
    expect(body.payment).toMatchObject({ method: 'card', amountCents: 18000 })
    expect(body.payment.url).toContain('acct_clinic1')
    expect(await visit(body.id)).toMatchObject({
      status: 'scheduled',
      online_payment_status: 'awaiting',
      paid: 0,
    })

    // Coming back to an unfinished payment returns the open session.
    const again = await call(
      'ana-online',
      'POST',
      `/client/spaces/${slug}/appointments/${body.id}/payment`,
    )
    expect(again.json().url).toContain('cs_test_')

    const session = `cs_test_${sessions}`
    expect((await hook({ id: 'evt_paid_1', session })).statusCode).toBe(200)
    expect((await hook({ id: 'evt_paid_1', session })).statusCode).toBe(200)
    expect(await visit(body.id)).toMatchObject({
      status: 'confirmed',
      online_payment_status: 'paid',
      paid: 18000,
    })
    const [entry] = await asOwner(() =>
      sql(
        `SELECT method, amount_cents, description FROM luminix.finance_entries
          WHERE clinic_id = $1 AND appointment_id = $2 AND status = 'active'`,
        [clinic, body.id],
      ),
    )
    expect(entry).toMatchObject({ method: 'credit', amount_cents: 18000 })
    expect(String(entry.description)).toContain('Pago pelo app')

    // A paid visit is canceled by the space until refunds exist (etapa 2).
    const cancel = await call(
      'ana-online',
      'POST',
      `/client/spaces/${slug}/appointments/${body.id}/cancel`,
    )
    expect(cancel.statusCode).toBe(409)
    expect(cancel.json().error).toBe('Contact the space')
  })

  it('frees the slot when the time runs out; money after that is flagged, not counted', async () => {
    const booked = (await book('pix')).json()
    const session = `cs_test_${sessions}`
    await asOwner(() =>
      sql(
        "UPDATE luminix.appointments SET online_payment_due_at = now() - interval '1 minute' WHERE id = $1",
        [booked.id],
      ),
    )
    await call('ana-online', 'GET', `/client/spaces/${slug}/appointments`)
    expect(await visit(booked.id)).toMatchObject({
      status: 'canceled',
      online_payment_status: 'expired',
      cancellation_origin: 'payment_expired',
    })
    await hook({ id: 'evt_late_1', session, type: 'checkout.session.async_payment_succeeded' })
    const [row] = await asOwner(() =>
      sql('SELECT status FROM luminix.online_payments WHERE session_id = $1', [session]),
    )
    expect(row.status).toBe('paid_late')
    expect((await visit(booked.id)).paid).toBe(0)
  })

  it('an expired session releases the hold right away', async () => {
    const booked = (await book('card')).json()
    await hook({
      id: 'evt_expired_1',
      session: `cs_test_${sessions}`,
      type: 'checkout.session.expired',
      outcome: 'expired',
    })
    expect(await visit(booked.id)).toMatchObject({
      status: 'canceled',
      online_payment_status: 'expired',
    })
  })

  it('refuses a webhook from another account and keeps the visit untouched', async () => {
    const booked = (await book('card')).json()
    const res = await hook({
      id: 'evt_other_1',
      session: `cs_test_${sessions}`,
      account: 'acct_other9',
    })
    expect(res.statusCode).toBe(200)
    expect(await visit(booked.id)).toMatchObject({ online_payment_status: 'awaiting', paid: 0 })
  })

  it('Pix not enabled on the account frees the slot and asks for another method', async () => {
    pixWorks = false
    const before = sessions
    const res = await book('pix')
    pixWorks = true
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('Pix unavailable')
    expect(sessions).toBe(before)
    const [held] = await asOwner(() =>
      sql(
        `SELECT count(*)::int AS total FROM luminix.appointments
          WHERE clinic_id = $1 AND online_payment_status = 'awaiting'
            AND status_note = 'Pagamento pelo app não aberto'`,
        [clinic],
      ),
    )
    expect(held.total).toBe(0)
  })

  it('a space whose Stripe account is not ready never holds a slot', async () => {
    ready = false
    const res = await book('card')
    ready = true
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('Payment unavailable')
    // Paying at the space keeps working.
    expect((await book('local')).statusCode).toBe(201)
  })
})
