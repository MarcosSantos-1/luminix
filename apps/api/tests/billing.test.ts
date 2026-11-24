import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import type { BillingEvent, BillingProvider } from '../src/modules/billing/provider.js'
import { applyMigrations, type SqlConnection } from '../src/shared/database/migrations.js'

// ADR-039: Luminix subscription. 12 free days, then 7 days of grace, then read-only (reads keep
// working, writes answer 402, online booking pauses). Only signed Stripe webhooks change access.
let db: PGlite
let connection: SqlConnection
let clinic: string
let slug: string
let service: string
const checkouts: { plan: string; method: string }[] = []

/** Fake Stripe: "signature" ok means the JSON body is the already mapped event. */
const provider: BillingProvider = {
  createCustomer: async ({ clinicId }) => `cus_${clinicId.slice(0, 8)}`,
  createCheckout: async ({ plan, method }) => {
    checkouts.push({ plan, method })
    return `https://checkout.stripe.test/${method}/${plan}`
  },
  createPortal: async () => 'https://billing.stripe.test/portal',
  readEvent: (raw, signature) => {
    if (signature !== 'ok') throw new Error('bad signature')
    const event = JSON.parse(raw.toString('utf8')) as BillingEvent & { periodEnd: string | null }
    return { ...event, periodEnd: event.periodEnd ? new Date(event.periodEnd) : null }
  },
}

async function call(
  user: string | null,
  method: 'GET' | 'POST' | 'PUT',
  url: string,
  payload?: object,
  options: { billing?: BillingProvider | null; headers?: Record<string, string> } = {},
) {
  const app = await buildApp(
    {},
    {
      database: connection,
      tenantPool: { connect: async () => ({ ...connection, release: () => {} }) },
      verifyToken: async (token) => ({ uid: token }),
      billingProvider: options.billing === undefined ? provider : options.billing,
    },
  )
  try {
    return await app.inject({
      method,
      url,
      headers: { ...(user ? { authorization: `Bearer ${user}` } : {}), ...options.headers },
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

/** Moves the clinic's dates so it lands in the wanted state. */
async function setDates(trialDaysFromNow: number, paidDaysFromNow: number | null = null) {
  await asOwner(() =>
    sql(
      `UPDATE luminix.clinic_subscriptions
          SET trial_ends_at = now() + make_interval(days => $2),
              paid_until = CASE WHEN $3::int IS NULL THEN NULL ELSE now() + make_interval(days => $3) END
        WHERE clinic_id = $1`,
      [clinic, trialDaysFromNow, paidDaysFromNow],
    ),
  )
}

const state = async () =>
  (await call('dona-plano', 'GET', `/clinics/${clinic}/billing`)).json().access.state

function nextWeekday(days = 2) {
  const date = new Date(Date.now() + days * 86_400_000)
  while ([0, 6].includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

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
    await connection.query('SELECT * FROM luminix.resolve_staff_identity($1)', ['dona-plano'])
  ).rows[0].identity_id
  clinic = String(
    (
      await connection.query('SELECT * FROM luminix.bootstrap_owner_clinic($1::uuid, $2)', [
        identity,
        'Studio Plano',
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
  service = String(
    (
      await connection.query(
        `INSERT INTO luminix.services (clinic_id, name, price_cents, duration_minutes, booking_mode)
         VALUES ($1, 'Escova', 8000, 60, 'instant') RETURNING id`,
        [clinic],
      )
    ).rows[0].id,
  )
  await db.exec('SET ROLE luminix_api')
  await call('ana-plano', 'PUT', '/client/me', {
    name: 'Ana',
    email: 'ana@example.com',
    phone: '(11) 98888-7777',
  })
  await call('ana-plano', 'PUT', '/client/me/anamnesis', {
    level: 1,
    answers: { sex: 'female', birthDate: '1992-04-10', allergies: 'no', cosmeticAllergy: 'no' },
    photo: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2Q==',
    consent: true,
  })
  await call('ana-plano', 'POST', '/client/spaces', { slug, shareAnamnesis: true })
})

afterAll(async () => {
  await db.close()
})

describe('assinatura do Luminix', () => {
  it('a new space starts the 12-day trial; the context brings the plan state', async () => {
    const context = await call('dona-plano', 'GET', `/clinics/${clinic}/context`)
    expect(context.json().access).toMatchObject({ state: 'trial' })
    const days = (Date.parse(context.json().access.trialEndsAt) - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(11)
    expect(days).toBeLessThanOrEqual(12)
  })

  it('goes from trial to grace (7 days) and then to read-only', async () => {
    await setDates(3)
    expect(await state()).toBe('trial')
    await setDates(-3)
    expect(await state()).toBe('grace')
    await setDates(-8)
    expect(await state()).toBe('read_only')
  })

  it('read-only keeps reads and payment open, refuses writes and pauses online booking', async () => {
    await setDates(-8)
    expect((await call('dona-plano', 'GET', `/clinics/${clinic}/clients`)).statusCode).toBe(200)
    const theme = await call('dona-plano', 'PUT', `/clinics/${clinic}/theme`, { theme: 'azul' })
    expect(theme.statusCode).toBe(402)
    expect(theme.json().error).toBe('Subscription required')
    const client = await call('dona-plano', 'POST', `/clinics/${clinic}/clients`, { name: 'Bia' })
    expect(client.statusCode).toBe(402)

    const checkout = await call('dona-plano', 'POST', `/clinics/${clinic}/billing/checkout`, {
      plan: 'monthly',
      method: 'pix',
    })
    expect(checkout.statusCode).toBe(200)
    expect(checkout.json().url).toBe('https://checkout.stripe.test/pix/monthly')

    const booking = await call('ana-plano', 'POST', `/client/spaces/${slug}/appointments`, {
      serviceId: service,
      localStartsAt: `${nextWeekday()}T09:00`,
      paymentMethod: 'local',
    })
    expect(booking.statusCode).toBe(409)
    expect(booking.json().error).toBe('Booking paused')
  })

  it('a paid Pix adds one month from today; the same event never counts twice', async () => {
    await setDates(-8)
    const event = {
      id: 'evt_pix_1',
      type: 'checkout.session.async_payment_succeeded',
      clinicId: clinic,
      kind: 'pix_paid',
      plan: 'monthly',
      cardStatus: null,
      periodEnd: null,
      cancelAtPeriodEnd: false,
      customer: `cus_${clinic.slice(0, 8)}`,
      subscription: null,
    }
    const hook = () =>
      call('', 'POST', '/billing/stripe/webhook', event, {
        headers: { 'stripe-signature': 'ok', 'content-type': 'application/json' },
      })
    expect((await hook()).statusCode).toBe(200)
    expect((await hook()).statusCode).toBe(200)
    const [row] = await asOwner(() =>
      sql(
        `SELECT plan, payment_method,
                round(extract(epoch FROM paid_until - now()) / 86400) AS days
           FROM luminix.clinic_subscriptions WHERE clinic_id = $1`,
        [clinic],
      ),
    )
    expect(row).toMatchObject({ plan: 'monthly', payment_method: 'pix' })
    expect(Number(row.days)).toBeGreaterThanOrEqual(28)
    expect(Number(row.days)).toBeLessThanOrEqual(31)
    expect(await state()).toBe('active')
    // Writing works again.
    expect(
      (await call('dona-plano', 'PUT', `/clinics/${clinic}/theme`, { theme: 'azul' })).statusCode,
    ).toBe(200)
  })

  it('card renewals move the paid date; a failed renewal keeps the last paid period', async () => {
    // Stripe sends whole seconds.
    const end = new Date(Math.floor(Date.now() / 1000 + 40 * 86_400) * 1000).toISOString()
    const base = {
      type: 'customer.subscription.updated',
      clinicId: clinic,
      kind: 'card_period',
      plan: 'annual',
      cancelAtPeriodEnd: false,
      customer: `cus_${clinic.slice(0, 8)}`,
      subscription: 'sub_123',
    }
    const send = (body: object) =>
      call('', 'POST', '/billing/stripe/webhook', body, {
        headers: { 'stripe-signature': 'ok', 'content-type': 'application/json' },
      })
    expect(
      (await send({ ...base, id: 'evt_card_1', cardStatus: 'active', periodEnd: end })).statusCode,
    ).toBe(200)
    await send({
      ...base,
      id: 'evt_card_2',
      cardStatus: 'past_due',
      periodEnd: new Date(Date.now() + 400 * 86_400_000).toISOString(),
    })
    const [row] = await asOwner(() =>
      sql(
        'SELECT card_status, payment_method, paid_until FROM luminix.clinic_subscriptions WHERE clinic_id = $1',
        [clinic],
      ),
    )
    expect(row).toMatchObject({ card_status: 'past_due', payment_method: 'card' })
    expect(new Date(String(row.paid_until)).toISOString()).toBe(end)
  })

  it('refuses unsigned webhooks and says when online payment is not configured', async () => {
    const unsigned = await call(
      '',
      'POST',
      '/billing/stripe/webhook',
      { id: 'evt_x' },
      {
        headers: { 'stripe-signature': 'bad', 'content-type': 'application/json' },
      },
    )
    expect(unsigned.statusCode).toBe(400)
    const off = await call(
      'dona-plano',
      'POST',
      `/clinics/${clinic}/billing/checkout`,
      { plan: 'annual', method: 'card' },
      { billing: null },
    )
    expect(off.statusCode).toBe(503)
    const info = await call('dona-plano', 'GET', `/clinics/${clinic}/billing`, undefined, {
      billing: null,
    })
    expect(info.json()).toMatchObject({ available: false })
  })
})
