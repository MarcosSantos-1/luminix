import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { applyMigrations, type SqlConnection } from '../src/shared/database/migrations.js'

let db: PGlite
let connection: SqlConnection
let app: Awaited<ReturnType<typeof buildApp>>
const clinics = new Map<string, { id: string; slug: string; client: string; service: string }>()
const warnings = ['past', 'outside_availability', 'overlap']

beforeAll(async () => {
  db = new PGlite()
  connection = {
    async query(sql, values) {
      if (values) return db.query(sql, values)
      const result = await db.exec(sql)
      return { rows: result.at(-1)?.rows ?? [] }
    },
  }
  await applyMigrations(connection)
  for (const label of ['a', 'b']) {
    const identity = (
      await connection.query('SELECT * FROM luminix.resolve_staff_identity($1)', [`owner-${label}`])
    ).rows[0].identity_id
    const id = String(
      (
        await connection.query('SELECT * FROM luminix.bootstrap_owner_clinic($1::uuid, $2)', [
          identity,
          `Studio ${label}`,
        ])
      ).rows[0].clinic_id,
    )
    await connection.query("SELECT set_config('luminix.clinic_id', $1, false)", [id])
    await connection.query(
      `INSERT INTO luminix.clinic_profiles (clinic_id, owner_name, contact_email, contact_phone, public_enabled)
       VALUES ($1, 'Dona', 'dona@example.com', '+5511999999999', true)`,
      [id],
    )
    const service = (
      await connection.query(
        `INSERT INTO luminix.services (clinic_id, name, category, price_cents, duration_minutes)
         VALUES ($1, 'Corte', 'Cabelo', 10000, 60) RETURNING id`,
        [id],
      )
    ).rows[0].id
    const client = (
      await connection.query(
        `INSERT INTO luminix.clinic_clients (clinic_id, display_name, contact_phone, birth_date)
         VALUES ($1, 'Cliente ${label}', '+5511988887777', (luminix.clinic_today() - interval '30 years')::date)
         RETURNING id`,
        [id],
      )
    ).rows[0].id
    await connection.query("UPDATE luminix.clinics SET status = 'active' WHERE id = $1", [id])
    const slug = String(
      (await connection.query('SELECT slug FROM luminix.clinics WHERE id = $1', [id])).rows[0].slug,
    )
    clinics.set(label, { id, slug, client: String(client), service: String(service) })
  }
  const reception = (
    await connection.query('SELECT * FROM luminix.resolve_staff_identity($1)', ['reception-a'])
  ).rows[0].identity_id
  const a = clinics.get('a')!.id
  await connection.query("SELECT set_config('luminix.clinic_id', $1, false)", [a])
  await connection.query(
    `INSERT INTO luminix.clinic_memberships (clinic_id, identity_id, role_id)
     SELECT $1, $2, id FROM luminix.roles WHERE clinic_id = $1 AND name = 'reception'`,
    [a, reception],
  )
  await db.exec('SET ROLE luminix_api')
  app = await buildApp(
    {},
    {
      database: connection,
      tenantPool: { connect: async () => ({ ...connection, release() {} }) },
      verifyToken: async (uid) => ({ uid }),
    },
  )
})
afterAll(async () => {
  await app?.close()
  await db?.close()
})

const as = (uid: string) => ({ authorization: `Bearer ${uid}` })
const c = (label: string) => clinics.get(label)!
// Distinct client IPs: the staff authenticator allows 30 requests/minute per IP.
let ip = 0
const call = (uid: string, method: 'GET' | 'PUT' | 'POST', url: string, payload?: object) =>
  app.inject({
    method,
    url,
    headers: as(uid),
    remoteAddress: `10.0.${Math.floor(++ip / 200)}.${ip % 200}`,
    ...(payload ? { payload } : {}),
  })
const service = (overrides: Record<string, unknown> = {}) => ({
  name: 'Escova',
  category: 'Cabelo',
  description: 'Escova modelada',
  priceCents: 8000,
  priceType: 'fixed',
  durationMinutes: 45,
  bookingMode: 'instant',
  audience: 'all',
  sensitive: false,
  ...overrides,
})
const publicServices = async (label: string) =>
  (await app.inject({ url: `/public/clinics/${c(label).slug}` })).json().clinic.services as {
    name: string
    priceCents: number
    promoPercent: number | null
    promoPriceCents: number | null
  }[]
const book = (uid: string, serviceId: string, localStartsAt: string) =>
  call(uid, 'POST', `/clinics/${c('a').id}/appointments`, {
    clientId: c('a').client,
    serviceId,
    localStartsAt,
    confirmedWarnings: warnings,
  })

describe('service catalog', () => {
  const escova = '5b3f2a10-1111-4c2d-9e8f-000000000001'
  it('creates, edits and pauses services, and the public site follows', async () => {
    expect(
      (await call('owner-a', 'PUT', `/clinics/${c('a').id}/catalog/services/${escova}`, service()))
        .statusCode,
    ).toBe(200)
    expect((await publicServices('a')).map((item) => item.name)).toContain('Escova')
    expect(
      (
        await call(
          'owner-a',
          'PUT',
          `/clinics/${c('a').id}/catalog/services/${escova}`,
          service({ priceCents: 9000 }),
        )
      ).statusCode,
    ).toBe(200)
    expect((await publicServices('a')).find((item) => item.name === 'Escova')?.priceCents).toBe(
      9000,
    )

    const duplicate = await call(
      'owner-a',
      'PUT',
      `/clinics/${c('a').id}/catalog/services/5b3f2a10-1111-4c2d-9e8f-000000000002`,
      service({ name: 'corte' }),
    )
    expect(duplicate.statusCode).toBe(409)
    expect(
      (
        await call(
          'reception-a',
          'PUT',
          `/clinics/${c('a').id}/catalog/services/${escova}`,
          service(),
        )
      ).statusCode,
    ).toBe(403)
    expect(
      (await call('owner-b', 'PUT', `/clinics/${c('a').id}/catalog/services/${escova}`, service()))
        .statusCode,
    ).toBe(403)

    const pause = (id: string) =>
      call('owner-a', 'POST', `/clinics/${c('a').id}/catalog/services/${id}/status`, {
        status: 'archived',
      })
    expect((await pause(escova)).statusCode).toBe(200)
    expect((await publicServices('a')).map((item) => item.name)).not.toContain('Escova')
    expect((await pause(c('a').service)).statusCode).toBe(400) // keeps at least one
    expect(
      (
        await call('owner-a', 'POST', `/clinics/${c('a').id}/catalog/services/${escova}/status`, {
          status: 'active',
        })
      ).statusCode,
    ).toBe(200)

    const catalog = (await call('reception-a', 'GET', `/clinics/${c('a').id}/catalog`)).json()
    expect(catalog.canManage).toBe(false)
    expect(catalog.services.map((item: { name: string }) => item.name)).toEqual(['Corte', 'Escova'])
  })
})

describe('promotions and appointment prices', () => {
  const promo = '7c1e5d20-2222-4a3b-8c9d-000000000001'
  it('applies the percent on the site and freezes it in new appointments', async () => {
    const today = (await call('owner-a', 'GET', `/clinics/${c('a').id}/catalog`)).json()
      .today as string
    const body = {
      name: 'Semana do corte',
      percent: 20,
      startsOn: today,
      endsOn: null,
      status: 'active',
      showOnSite: true,
      serviceIds: [c('a').service],
    }
    expect(
      (await call('owner-a', 'PUT', `/clinics/${c('a').id}/catalog/promotions/${promo}`, body))
        .statusCode,
    ).toBe(200)
    expect(
      (
        await call('owner-a', 'PUT', `/clinics/${c('a').id}/catalog/promotions/${promo}`, {
          ...body,
          serviceIds: [c('b').service],
        })
      ).statusCode,
    ).toBe(400)
    const corte = (await publicServices('a')).find((item) => item.name === 'Corte')!
    expect(corte).toMatchObject({ priceCents: 10000, promoPercent: 20, promoPriceCents: 8000 })

    // Reception can book again (create_manager_appointment now authorizes agenda:manage).
    const booked = await book('reception-a', c('a').service, `${today}T10:00`)
    expect(booked.statusCode).toBe(201)
    const id = booked.json().appointment.id as string
    await db.exec('RESET ROLE')
    const row = (
      await connection.query(
        'SELECT list_price_cents, price_cents, promotion_id FROM luminix.appointments WHERE id = $1',
        [id],
      )
    ).rows[0]
    await db.exec('SET ROLE luminix_api')
    expect(row).toMatchObject({ list_price_cents: 10000, price_cents: 8000, promotion_id: promo })

    expect(
      (
        await call('owner-a', 'PUT', `/clinics/${c('a').id}/catalog/promotions/${promo}`, {
          ...body,
          status: 'paused',
        })
      ).statusCode,
    ).toBe(200)
    expect(
      (await publicServices('a')).find((item) => item.name === 'Corte')?.promoPercent,
    ).toBeNull()
  })
})

describe('appointments, finance and reports', () => {
  it('completes an appointment, records the income once and reports it', async () => {
    const today = (await call('owner-a', 'GET', `/clinics/${c('a').id}/catalog`)).json()
      .today as string
    const booked = await book('owner-a', c('a').service, `${today}T15:00`)
    const id = booked.json().appointment.id as string
    expect(
      (
        await call('reception-a', 'PUT', `/clinics/${c('a').id}/appointments/${id}/status`, {
          status: 'completed',
        })
      ).statusCode,
    ).toBe(200)

    const finance = (await call('owner-a', 'GET', `/clinics/${c('a').id}/finance`)).json()
    const pending = finance.pending.find(
      (item: { appointmentId: string }) => item.appointmentId === id,
    )
    expect(pending).toMatchObject({ priceCents: 10000, service: 'Corte' })
    expect((await call('reception-a', 'GET', `/clinics/${c('a').id}/finance`)).statusCode).toBe(403)

    const entry = {
      kind: 'income',
      amountCents: 10000,
      occurredOn: today,
      description: 'Corte · Cliente a',
      method: 'pix',
      appointmentId: id,
    }
    expect(
      (await call('owner-a', 'POST', `/clinics/${c('a').id}/finance/entries`, entry)).statusCode,
    ).toBe(200)
    expect(
      (await call('owner-a', 'POST', `/clinics/${c('a').id}/finance/entries`, entry)).statusCode,
    ).toBe(409)
    expect(
      (
        await call('owner-a', 'POST', `/clinics/${c('a').id}/finance/entries`, {
          kind: 'expense',
          amountCents: 2500,
          occurredOn: today,
          description: 'Shampoo',
          category: 'Produtos',
        })
      ).statusCode,
    ).toBe(200)
    const after = (await call('owner-a', 'GET', `/clinics/${c('a').id}/finance`)).json()
    expect(after.totals).toEqual({ incomeCents: 10000, expenseCents: 2500, balanceCents: 7500 })
    expect(after.pending.some((item: { appointmentId: string }) => item.appointmentId === id)).toBe(
      false,
    )

    const report = (
      await call('owner-a', 'GET', `/clinics/${c('a').id}/reports?from=${today}&to=${today}`)
    ).json()
    expect(report.finance.balanceCents).toBe(7500)
    expect(report.appointments.byStatus.completed.count).toBe(1)
    expect(report.topServices[0].name).toBe('Corte')
    expect(report.daily).toHaveLength(1)

    const ownerHome = (await call('owner-a', 'GET', `/clinics/${c('a').id}/dashboard`)).json()
    expect(ownerHome.appointments.length).toBeGreaterThanOrEqual(2)
    expect(ownerHome.finance.monthIncomeCents).toBe(10000)
    expect(ownerHome.activity.length).toBeGreaterThan(0)
    const receptionHome = (
      await call('reception-a', 'GET', `/clinics/${c('a').id}/dashboard`)
    ).json()
    expect(receptionHome.finance).toBeUndefined()
    expect(receptionHome.appointments[0].priceCents).toBeNull()
    expect((await call('owner-b', 'GET', `/clinics/${c('a').id}/dashboard`)).statusCode).toBe(403)
  })
})

describe('inventory and marketing', () => {
  const item = '9d8c7b60-3333-4e5f-8a9b-000000000001'
  it('tracks stock with movements and never goes below zero', async () => {
    const save = await call('reception-a', 'PUT', `/clinics/${c('a').id}/inventory/items/${item}`, {
      name: 'Shampoo 1L',
      category: 'Cabelo',
      unit: 'fr',
      minQuantity: 2,
      initialQuantity: 5,
      costCents: 3500,
    })
    expect(save.statusCode).toBe(200)
    const move = (kind: string, quantity: number) =>
      call('reception-a', 'POST', `/clinics/${c('a').id}/inventory/items/${item}/movements`, {
        kind,
        quantity,
      })
    expect((await move('out', 4)).json().balance).toBe(1)
    expect((await move('out', 3)).statusCode).toBe(400)
    const stock = (await call('owner-a', 'GET', `/clinics/${c('a').id}/inventory`)).json()
    expect(stock.lowStock).toBe(1)
    expect(stock.items[0]).toMatchObject({ name: 'Shampoo 1L', quantity: 1 })
    expect(stock.movements.map((m: { kind: string }) => m.kind)).toEqual(['out', 'in'])
    expect((await move('adjust', 6)).json().balance).toBe(6)
    expect((await call('owner-b', 'GET', `/clinics/${c('a').id}/inventory`)).statusCode).toBe(403)
  })

  it('lists birthdays of the month for marketing', async () => {
    const marketing = (await call('owner-a', 'GET', `/clinics/${c('a').id}/marketing`)).json()
    expect(marketing.birthdays.map((b: { name: string }) => b.name)).toEqual(['Cliente a'])
    expect(marketing.site).toMatchObject({ slug: c('a').slug, published: true })
  })
})
