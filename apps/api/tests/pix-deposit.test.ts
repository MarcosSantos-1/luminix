import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { applyMigrations, type SqlConnection } from '../src/shared/database/migrations.js'

// ADR-037: sinal por Pix do espaço. The slot is held until the team confirms the deposit;
// an unpaid hold past its time frees the slot; confirming records a Pix payment of the visit.
let db: PGlite
let connection: SqlConnection
let clinic: string
let slug: string
let laser: string
let brush: string

const basic = { sex: 'female', birthDate: '1992-04-10', allergies: 'no', cosmeticAllergy: 'no' }
const anamnesis = {
  level: 1,
  answers: basic,
  photo: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2Q==',
  consent: true,
}

function nextWeekday(days = 2) {
  const date = new Date(Date.now() + days * 86_400_000)
  while ([0, 6].includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

async function call(user: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) {
  const app = await buildApp(
    {},
    {
      database: connection,
      tenantPool: { connect: async () => ({ ...connection, release: () => {} }) },
      verifyToken: async (token) => ({ uid: token }),
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

async function joinAs(user: string) {
  await call(user, 'PUT', '/client/me', {
    name: `Cliente ${user}`,
    email: `${user}@example.com`,
    phone: '(11) 98888-7777',
  })
  await call(user, 'PUT', '/client/me/anamnesis', anamnesis)
  await call(user, 'POST', '/client/spaces', { slug, shareAnamnesis: true })
}

const sql = async (text: string, values: unknown[] = []) =>
  (await db.query<Record<string, unknown>>(text, values)).rows

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
    await connection.query('SELECT * FROM luminix.resolve_staff_identity($1)', ['dona-pix'])
  ).rows[0].identity_id
  clinic = String(
    (
      await connection.query('SELECT * FROM luminix.bootstrap_owner_clinic($1::uuid, $2)', [
        identity,
        'Studio Pix',
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
    `INSERT INTO luminix.clinic_profiles (clinic_id, owner_name, contact_email, contact_phone, public_enabled,
       anamnesis_level)
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
    `INSERT INTO luminix.booking_policies (clinic_id, booking_notice_minutes, booking_window_days,
       deposit_scope, deposit_percent, pix_key, pix_key_type)
     VALUES ($1, 0, 60, 'selected', 30, 'pix@studio.com', 'email')`,
    [clinic],
  )
  laser = String(
    (
      await connection.query(
        `INSERT INTO luminix.services (clinic_id, name, price_cents, duration_minutes, booking_mode, deposit_required)
         VALUES ($1, 'Laser', 15000, 60, 'instant', true) RETURNING id`,
        [clinic],
      )
    ).rows[0].id,
  )
  brush = String(
    (
      await connection.query(
        `INSERT INTO luminix.services (clinic_id, name, price_cents, duration_minutes, booking_mode)
         VALUES ($1, 'Escova', 8000, 60, 'instant') RETURNING id`,
        [clinic],
      )
    ).rows[0].id,
  )
  await db.exec('SET ROLE luminix_api')
  await joinAs('ana-pix')
  await joinAs('bia-pix')
})

afterAll(async () => {
  await db.close()
})

describe('sinal por Pix', () => {
  it('asks an app that cannot show the Pix code to update instead of holding the slot', async () => {
    const old = await call('ana-pix', 'POST', `/client/spaces/${slug}/appointments`, {
      serviceId: laser,
      localStartsAt: `${nextWeekday()}T09:00`,
      paymentMethod: 'local',
    })
    expect(old.statusCode).toBe(409)
    expect(old.json().error).toBe('Deposit required')
  })

  it('holds the slot awaiting the deposit, with the Pix code of the space', async () => {
    const booked = await call('ana-pix', 'POST', `/client/spaces/${slug}/appointments`, {
      serviceId: laser,
      localStartsAt: `${nextWeekday()}T09:00`,
      paymentMethod: 'local',
      deposit: 'pix',
    })
    expect(booked.statusCode).toBe(201)
    const body = booked.json()
    expect(body.status).toBe('scheduled')
    expect(body.deposit).toMatchObject({ cents: 4500, status: 'awaiting' })
    expect(body.deposit.pix.code).toContain('pix@studio.com')
    expect(body.deposit.pix.code).toContain('540545.00')

    // Nobody else can take it while it is held.
    const clash = await call('bia-pix', 'POST', `/client/spaces/${slug}/appointments`, {
      serviceId: brush,
      localStartsAt: `${nextWeekday()}T09:00`,
      paymentMethod: 'local',
    })
    expect(clash.statusCode).toBe(409)

    // "Já paguei" keeps it held; the team confirms and it becomes a Pix payment.
    expect(
      (await call('ana-pix', 'POST', `/client/spaces/${slug}/appointments/${body.id}/deposit-paid`))
        .statusCode,
    ).toBe(200)
    const confirm = await call(
      'dona-pix',
      'POST',
      `/clinics/${clinic}/appointments/${body.id}/deposit/confirm`,
    )
    expect(confirm.statusCode).toBe(200)
    const [row] = await sql(
      `SELECT a.status, a.deposit_status, luminix.appointment_paid_cents(a.clinic_id, a.id) AS paid
         FROM luminix.appointments a WHERE a.clinic_id = $1 AND a.id = $2`,
      [clinic, body.id],
    )
    expect(row).toMatchObject({ status: 'confirmed', deposit_status: 'confirmed', paid: 4500 })
    // Confirming twice does not pay twice.
    await call('dona-pix', 'POST', `/clinics/${clinic}/appointments/${body.id}/deposit/confirm`)
    const [again] = await sql('SELECT luminix.appointment_paid_cents($1, $2) AS paid', [
      clinic,
      body.id,
    ])
    expect(again.paid).toBe(4500)
  })

  it('frees the slot when the hold runs out without payment', async () => {
    const date = nextWeekday(3)
    const booked = (
      await call('bia-pix', 'POST', `/client/spaces/${slug}/appointments`, {
        serviceId: laser,
        localStartsAt: `${date}T10:00`,
        paymentMethod: 'local',
        deposit: 'pix',
      })
    ).json()
    await db.exec('RESET ROLE')
    await sql(
      "UPDATE luminix.appointments SET deposit_due_at = now() - interval '1 minute' WHERE id = $1",
      [booked.id],
    )
    await db.exec('SET ROLE luminix_api')
    const slots = (
      await call(
        'ana-pix',
        'GET',
        `/client/spaces/${slug}/availability?serviceId=${brush}&date=${date}`,
      )
    ).json()
    expect(JSON.stringify(slots)).toContain('10:00')
    const mine = (await call('bia-pix', 'GET', `/client/spaces/${slug}/appointments`)).json()
    const expired = mine.appointments.find((item: { id: string }) => item.id === booked.id)
    expect(expired.status).toBe('canceled')
    expect(expired.deposit).toMatchObject({ status: 'expired', pix: null })
  })

  it('services without deposit book as before', async () => {
    const booked = await call('ana-pix', 'POST', `/client/spaces/${slug}/appointments`, {
      serviceId: brush,
      localStartsAt: `${nextWeekday(4)}T11:00`,
      paymentMethod: 'local',
    })
    expect(booked.statusCode).toBe(201)
    expect(booked.json()).toMatchObject({ status: 'confirmed', deposit: null })
  })
})
