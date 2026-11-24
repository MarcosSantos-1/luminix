import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import type { ConnectProvider, ConnectStatus } from '../src/modules/payments/stripe-connect.js'
import type { OutgoingEmail } from '../src/shared/integrations/email/mailer.js'
import { applyMigrations, type SqlConnection } from '../src/shared/database/migrations.js'

// ADR-041: the last Stripe status of the clinic's account is saved; the owner gets one e-mail per
// answer (approved, needs info, not approved); the setup goes on while Stripe reviews; clients
// see Pix/card only with the switch on and the account approved.
let db: PGlite
let connection: SqlConnection
let clinic: string
let slug: string
let service: string
const emails: OutgoingEmail[] = []
let current: ConnectStatus = {
  state: 'pending',
  chargesEnabled: false,
  payoutsEnabled: false,
  requirementsDue: 3,
  testMode: false,
}

const connect: ConnectProvider = {
  context: async () => ({
    platformAccountId: 'acct_platform1',
    livemode: false,
    publishableKey: 'pk',
  }),
  create: async () => 'acct_unused',
  status: async () => current,
  session: async () => 'secret',
}

async function call(user: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) {
  const app = await buildApp(
    {},
    {
      database: connection,
      tenantPool: { connect: async () => ({ ...connection, release: () => {} }) },
      verifyToken: async (token) => ({ uid: token }),
      connectProvider: connect,
      mailer: { send: async (email) => void emails.push(email) },
      adminOrigin: 'http://localhost:3000',
    },
  )
  try {
    return await app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${user}` },
      ...(payload ? { payload } : {}),
    })
  } finally {
    await app.close()
  }
}

const status = async () =>
  (await call('dona-connect', 'GET', `/clinics/${clinic}/payments/connect`)).json()
const settle = () => new Promise((resolve) => setTimeout(resolve, 20))
const notices = async () =>
  (await call('dona-connect', 'GET', `/clinics/${clinic}/notices`))
    .json()
    .notices.map((notice: { id: string }) => notice.id)

function nextWeekday() {
  const date = new Date(Date.now() + 3 * 86_400_000)
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
    await connection.query('SELECT * FROM luminix.resolve_staff_identity($1)', ['dona-connect'])
  ).rows[0].identity_id
  clinic = String(
    (
      await connection.query('SELECT * FROM luminix.bootstrap_owner_clinic($1::uuid, $2)', [
        identity,
        'Studio Connect',
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
     VALUES ($1, 'Maria Dona', 'dona@example.com', '+5511999999999', true, 1)`,
    [clinic],
  )
  await connection.query(
    `INSERT INTO luminix.stripe_connect_accounts
       (clinic_id, platform_account_id, livemode, account_id, connected_at)
     VALUES ($1, 'acct_platform1', false, 'acct_clinic9', now())`,
    [clinic],
  )
  for (let weekday = 1; weekday <= 5; weekday++)
    await connection.query(
      `INSERT INTO luminix.weekly_availability (clinic_id, weekday, is_available, periods)
       VALUES ($1, $2, true, '[{"start":"09:00","end":"13:00"}]')`,
      [clinic, weekday],
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
  await call('ana-connect', 'PUT', '/client/me', {
    name: 'Ana',
    email: 'ana@example.com',
    phone: '(11) 98888-7777',
  })
  await call('ana-connect', 'PUT', '/client/me/anamnesis', {
    level: 1,
    answers: { sex: 'female', birthDate: '1992-04-10', allergies: 'no', cosmeticAllergy: 'no' },
    photo: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2Q==',
    consent: true,
  })
  await call('ana-connect', 'POST', '/client/spaces', { slug, shareAnamnesis: true })
})

afterAll(async () => {
  await db.close()
})

describe('situação da conta Stripe e avisos', () => {
  it('while the form has pending fields: not submitted, no e-mail, switch refused', async () => {
    const body = await status()
    expect(body).toMatchObject({ submitted: false, notice: 'filling', inApp: { enabled: false } })
    const on = await call('dona-connect', 'PUT', `/clinics/${clinic}/payments/in-app`, {
      enabled: true,
    })
    expect(on.statusCode).toBe(409)
    await settle()
    expect(emails).toHaveLength(0)
  })

  it('sent and under review: setup may go on, panel says "em análise", still no e-mail', async () => {
    current = { ...current, requirementsDue: 0 }
    expect(await status()).toMatchObject({ submitted: true, ready: false, notice: 'reviewing' })
    expect(await notices()).toContain('connect-reviewing')
    // The owner may already switch it on; clients do not see it until Stripe approves.
    const on = await call('dona-connect', 'PUT', `/clinics/${clinic}/payments/in-app`, {
      enabled: true,
    })
    expect(on.statusCode).toBe(200)
    const availability = await call(
      'ana-connect',
      'GET',
      `/client/spaces/${slug}/availability?serviceId=${service}&date=${nextWeekday()}`,
    )
    expect(availability.json().inAppPayments).toBe(false)
    await settle()
    expect(emails).toHaveLength(0)
  })

  it('approved: one e-mail with the next steps, the notice leads there, clients see Pix/card', async () => {
    current = {
      state: 'active',
      chargesEnabled: true,
      payoutsEnabled: true,
      requirementsDue: 0,
      testMode: false,
    }
    expect(await status()).toMatchObject({ ready: true, notice: 'approved' })
    await status()
    await settle()
    expect(emails).toHaveLength(1)
    expect(emails[0]).toMatchObject({ to: 'dona@example.com', tag: 'connect_status' })
    expect(emails[0].subject).toContain('já pode receber pelo app')
    expect(emails[0].html).toContain('/recebimentos')
    expect(await notices()).toContain('connect-approved')
    const availability = await call(
      'ana-connect',
      'GET',
      `/client/spaces/${slug}/availability?serviceId=${service}&date=${nextWeekday()}`,
    )
    expect(availability.json().inAppPayments).toBe(true)
    // Done with the next steps: the notice goes away.
    expect(
      (await call('dona-connect', 'POST', `/clinics/${clinic}/payments/guide-done`)).statusCode,
    ).toBe(200)
    expect(await notices()).not.toContain('connect-approved')
  })

  it('Stripe asks for more after approval: one e-mail and a "Completar" notice', async () => {
    current = { ...current, state: 'pending', chargesEnabled: false, requirementsDue: 1 }
    expect(await status()).toMatchObject({ ready: false, notice: 'needs_info' })
    await status()
    await settle()
    expect(emails).toHaveLength(2)
    expect(emails[1].subject).toContain('mais uma informação')
    expect(await notices()).toContain('connect-needs-info')
  })
})
