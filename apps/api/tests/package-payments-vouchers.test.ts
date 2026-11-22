import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { applyMigrations, type SqlConnection } from '../src/shared/database/migrations.js'

// Package payments (paid / per visit / later) and the "Serviço grátis" voucher (migration 0060).
let db: PGlite
let connection: SqlConnection
let app: Awaited<ReturnType<typeof buildApp>>
let clinicA: string
let clinicB: string
let facial: string
let laser: string
let client: string

beforeAll(async () => {
  db = new PGlite()
  connection = {
    async query(sql, values) {
      if (values) return db.query(sql, values)
      const results = await db.exec(sql)
      return { rows: results.at(-1)?.rows ?? [] }
    },
  }
  await applyMigrations(connection)
  const identity = async (uid: string) =>
    String(
      (await connection.query('SELECT * FROM luminix.resolve_staff_identity($1)', [uid])).rows[0]
        .identity_id,
    )
  const clinic = async (owner: string, name: string) =>
    String(
      (
        await connection.query('SELECT * FROM luminix.bootstrap_owner_clinic($1, $2)', [
          owner,
          name,
        ])
      ).rows[0].clinic_id,
    )
  clinicA = await clinic(await identity('pay-a'), 'Pay A')
  clinicB = await clinic(await identity('pay-b'), 'Pay B')
  await connection.query("SELECT set_config('luminix.clinic_id', $1, false)", [clinicA])
  facial = String(
    (
      await connection.query(
        `INSERT INTO luminix.services (clinic_id, name, price_cents, duration_minutes)
         VALUES ($1, 'Limpeza de pele', 12000, 60) RETURNING id`,
        [clinicA],
      )
    ).rows[0].id,
  )
  laser = String(
    (
      await connection.query(
        `INSERT INTO luminix.services (clinic_id, name, price_cents, duration_minutes, booking_mode)
         VALUES ($1, 'Laser', 30000, 60, 'manual_release') RETURNING id`,
        [clinicA],
      )
    ).rows[0].id,
  )
  await db.exec('SET ROLE luminix_api')
})

beforeEach(async () => {
  await app?.close()
  app = await buildApp(
    {},
    {
      database: connection,
      tenantPool: { connect: async () => ({ ...connection, release: () => {} }) },
      verifyToken: async (token) => ({ uid: token }),
    },
  )
})

afterAll(async () => {
  await app?.close()
  await db?.close()
})

function call(
  uid: string,
  method: 'GET' | 'POST' | 'PUT',
  clinic: string,
  path: string,
  body?: object,
) {
  return app.inject({
    method,
    url: `/clinics/${clinic}/${path}`,
    headers: body
      ? { authorization: `Bearer ${uid}`, 'content-type': 'application/json' }
      : { authorization: `Bearer ${uid}` },
    payload: body ? JSON.stringify(body) : undefined,
  })
}

const week = (periods: { start: string; end: string }[], weekdays = [0, 1, 2, 3, 4, 5, 6]) =>
  Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    isAvailable: weekdays.includes(weekday),
    periods: weekdays.includes(weekday) ? periods : [],
  }))

describe('pacote pago a cada sessão', () => {
  it('records each installment in the Financeiro and shows the visits in order', async () => {
    client = (await call('pay-a', 'POST', clinicA, 'clients', { name: 'Clara Pacote' })).json()
      .client.id
    await call('pay-a', 'PUT', clinicA, 'availability', {
      mode: 'weekly',
      days: week([{ start: '08:00', end: '20:00' }]),
    })
    const packageId = '11111111-2222-4333-8444-555555555555'
    expect(
      (
        await call('pay-a', 'PUT', clinicA, `catalog/packages/${packageId}`, {
          serviceId: facial,
          name: 'Limpeza 3 sessões',
          sessions: 3,
          priceCents: 30000,
          validityDays: 180,
        })
      ).statusCode,
    ).toBe(200)
    const sold = await call('pay-a', 'POST', clinicA, `clients/${client}/packages`, {
      packageId,
      soldOn: '2030-07-01',
      paymentPlan: 'per_visit',
    })
    expect(sold.statusCode).toBe(201)
    const clientPackage = sold.json().id
    const visit = (
      await call('pay-a', 'POST', clinicA, 'appointments', {
        clientId: client,
        serviceId: facial,
        localStartsAt: '2030-07-02T10:00',
        clientPackageId: clientPackage,
      })
    ).json().appointment.id
    const paid = await call('pay-a', 'POST', clinicA, `client-packages/${clientPackage}/payments`, {
      amountCents: 10000,
      method: 'pix',
      occurredOn: '2030-07-02',
      appointmentId: visit,
    })
    expect(paid.statusCode).toBe(201)
    expect(paid.json().paidCents).toBe(10000)
    // Never more than the package price.
    expect(
      (
        await call('pay-a', 'POST', clinicA, `client-packages/${clientPackage}/payments`, {
          amountCents: 25000,
          occurredOn: '2030-07-02',
        })
      ).statusCode,
    ).toBe(400)
    const mine = (await call('pay-a', 'GET', clinicA, `clients/${client}/packages`))
      .json()
      .packages.find((item: { id: string }) => item.id === clientPackage)
    expect(mine).toMatchObject({
      paymentPlan: 'per_visit',
      paidCents: 10000,
      remainingCents: 20000,
      installmentCents: 10000,
      used: 1,
      left: 2,
    })
    expect(mine.visits).toEqual([expect.objectContaining({ id: visit, number: 1 })])
    // Another clinic cannot pay or read it.
    expect(
      (
        await call('pay-b', 'POST', clinicB, `client-packages/${clientPackage}/payments`, {
          amountCents: 100,
          occurredOn: '2030-07-02',
        })
      ).statusCode,
    ).not.toBe(201)
  })
})

describe('voucher de serviço grátis', () => {
  it('only pays for its own service and makes that visit free', async () => {
    const voucher = '99999999-8888-4777-8666-555555555555'
    const issued = await call('pay-a', 'POST', clinicA, `clients/${client}/vouchers`, {
      id: voucher,
      type: 'service',
      value: 100,
      expiresOn: '2028-10-31',
      serviceId: facial,
    })
    expect(issued.statusCode).toBe(201)
    const listed = (await call('pay-a', 'GET', clinicA, `clients/${client}/vouchers`)).json()
      .vouchers
    expect(listed[0]).toMatchObject({ discount_type: 'service', service_name: 'Limpeza de pele' })
    expect(
      (
        await call('pay-a', 'POST', clinicA, 'appointments', {
          clientId: client,
          serviceId: laser,
          localStartsAt: '2028-06-05T10:00',
          voucherId: voucher,
          confirmedWarnings: ['equipment'],
        })
      ).statusCode,
    ).not.toBe(201)
    const free = await call('pay-a', 'POST', clinicA, 'appointments', {
      clientId: client,
      serviceId: facial,
      localStartsAt: '2028-06-05T14:00',
      voucherId: voucher,
    })
    expect(free.statusCode).toBe(201)
    const price = (
      await connection.query('SELECT price_cents FROM luminix.appointments WHERE id = $1', [
        free.json().appointment.id,
      ])
    ).rows[0].price_cents
    expect(Number(price)).toBe(0)
  })
})
