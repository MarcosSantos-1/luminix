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

  it('sells a service at a hand-picked promotion price and refuses a non-discount', async () => {
    const promo = crypto.randomUUID()
    const today = (await call('owner-a', 'GET', `/clinics/${c('a').id}/catalog`)).json()
      .today as string
    const body = {
      name: 'Flash day',
      kind: 'custom',
      percent: 35,
      startsOn: today,
      endsOn: null,
      status: 'active',
      showOnSite: true,
      serviceIds: [c('a').service],
      prices: { [c('a').service]: 6500 },
    }
    const put = (payload: object) =>
      call('owner-a', 'PUT', `/clinics/${c('a').id}/catalog/promotions/${promo}`, payload)
    // Not below the catalog price (R$ 100), or missing: refused.
    expect((await put({ ...body, prices: { [c('a').service]: 10000 } })).statusCode).toBe(400)
    expect((await put({ ...body, prices: {} })).statusCode).toBe(400)
    expect((await put(body)).statusCode).toBe(200)

    const corte = (await publicServices('a')).find((item) => item.name === 'Corte')!
    expect(corte).toMatchObject({ priceCents: 10000, promoPercent: 35, promoPriceCents: 6500 })
    const catalog = (await call('owner-a', 'GET', `/clinics/${c('a').id}/catalog`)).json()
    expect(catalog.promotions.find((item: { id: string }) => item.id === promo)).toMatchObject({
      kind: 'custom',
      prices: { [c('a').service]: 6500 },
    })
    expect(
      catalog.services.find((item: { id: string }) => item.id === c('a').service).promotion,
    ).toMatchObject({ id: promo, priceCents: 6500 })
    expect((await put({ ...body, status: 'archived' })).statusCode).toBe(200)
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
    expect(after.totals).toMatchObject({
      incomeCents: 10000,
      incomeAppointmentsCents: 10000,
      expenseCents: 2500,
      balanceCents: 7500,
    })
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

describe('own account and client account photo', () => {
  const photo = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
  it('lets any member edit only their own name and photo', async () => {
    const base = `/clinics/${c('a').id}/account`
    expect(
      (await call('reception-a', 'PUT', base, { name: 'Ana Recepção', photo })).statusCode,
    ).toBe(200)
    expect((await call('reception-a', 'GET', base)).json()).toMatchObject({
      name: 'Ana Recepção',
      photo,
    })
    // The owner's record is untouched, and a non-JPEG payload is refused.
    expect((await call('owner-a', 'GET', base)).json().photo).toBeNull()
    expect(
      (await call('owner-a', 'PUT', base, { name: 'Dona', photo: 'data:text/html;base64,AAAA' }))
        .statusCode,
    ).toBe(400)
    expect((await call('owner-b', 'GET', base)).statusCode).toBe(403)
  })

  it('reports no account photo for a client that never sent one', async () => {
    const list = (await call('owner-a', 'GET', `/clinics/${c('a').id}/clients?status=all`)).json()
    expect(list.clients.length).toBeGreaterThan(0)
    expect(list.clients[0]).toMatchObject({ account_photo: false, photo_url: null })
    const one = await call(
      'owner-a',
      'GET',
      `/clinics/${c('a').id}/clients/${list.clients[0].id}/photo`,
    )
    expect(one.json()).toEqual({ photo: null })
    expect(
      (await call('owner-b', 'GET', `/clinics/${c('a').id}/clients/${list.clients[0].id}/photo`))
        .statusCode,
    ).toBe(403)
  })
})

describe('inventory and marketing', () => {
  const item = '9d8c7b60-3333-4e5f-8a9b-000000000001'
  it('keeps recurring bills, settles one per month and isolates them by clinic', async () => {
    const bill = crypto.randomUUID()
    const base = `/clinics/${c('a').id}/finance`
    const body = {
      name: 'Aluguel',
      category: 'Aluguel',
      amountCents: 150000,
      dueDay: 10,
      status: 'active',
    }
    expect((await call('reception-a', 'PUT', `${base}/bills/${bill}`, body)).statusCode).toBe(403)
    expect((await call('owner-a', 'PUT', `${base}/bills/${bill}`, body)).statusCode).toBe(200)
    // Another clinic can neither take over the id nor settle it.
    expect(
      (await call('owner-b', 'PUT', `/clinics/${c('b').id}/finance/bills/${bill}`, body))
        .statusCode,
    ).toBe(400)
    const today = (await call('owner-a', 'GET', base)).json().today as string
    const entry = {
      kind: 'expense',
      amountCents: 152000,
      occurredOn: today,
      description: 'Aluguel',
      category: 'Aluguel',
      billId: bill,
      billMonth: today.slice(0, 7),
    }
    expect(
      (await call('owner-b', 'POST', `/clinics/${c('b').id}/finance/entries`, entry)).statusCode,
    ).toBe(400)
    expect((await call('owner-a', 'POST', `${base}/entries`, entry)).statusCode).toBe(200)
    // Paid once per month.
    expect((await call('owner-a', 'POST', `${base}/entries`, entry)).statusCode).toBe(409)
    const finance = (await call('owner-a', 'GET', base)).json()
    expect(finance.bills).toEqual([
      expect.objectContaining({ id: bill, amountCents: 150000, dueDay: 10, paidCents: 152000 }),
    ])
    expect(finance.totals.expenseFixedCents).toBe(152000)
    expect(finance.expenseCategories).toContainEqual({
      category: 'Aluguel',
      cents: 152000,
      fixedCents: 152000,
    })
    expect(finance.trend).toHaveLength(6)
    expect((await call('owner-b', 'GET', `/clinics/${c('b').id}/finance`)).json().bills).toEqual([])
  })

  it('tracks stock with movements and never goes below zero', async () => {
    const save = await call('reception-a', 'PUT', `/clinics/${c('a').id}/inventory/items/${item}`, {
      name: 'Shampoo 1L',
      category: 'Cabelo',
      unit: 'ml',
      minQuantity: 2000,
      initialQuantity: 5000,
      costCents: 3500,
      packageSize: 1000,
      packageLabel: 'frasco',
    })
    expect(save.statusCode).toBe(200)
    // A photo that was never uploaded for this product is refused.
    expect(
      (
        await call('reception-a', 'PUT', `/clinics/${c('a').id}/inventory/items/${item}`, {
          name: 'Shampoo 1L',
          unit: 'ml',
          minQuantity: 2000,
          photoAssetId: crypto.randomUUID(),
        })
      ).statusCode,
    ).toBe(400)
    const first = (await call('owner-a', 'GET', `/clinics/${c('a').id}/inventory`)).json()
    expect(first.items[0]).toMatchObject({
      packageSize: 1000,
      packageLabel: 'frasco',
      photoUrl: null,
    })
    // Five 1-litre bottles at R$ 35 each.
    expect(first.stockValueCents).toBe(17500)
    const move = (kind: string, quantity: number) =>
      call('reception-a', 'POST', `/clinics/${c('a').id}/inventory/items/${item}/movements`, {
        kind,
        quantity,
      })
    expect((await move('out', 4000)).json().balance).toBe(1000)
    expect((await move('out', 3000)).statusCode).toBe(400)
    const stock = (await call('owner-a', 'GET', `/clinics/${c('a').id}/inventory`)).json()
    expect(stock.lowStock).toBe(1)
    expect(stock.items[0]).toMatchObject({ name: 'Shampoo 1L', quantity: 1000, used30: 4000 })
    expect(stock.movements.map((m: { kind: string }) => m.kind)).toEqual(['out', 'in'])
    expect((await move('adjust', 6000)).json().balance).toBe(6000)
    expect((await call('owner-b', 'GET', `/clinics/${c('a').id}/inventory`)).statusCode).toBe(403)
  })

  it('keeps the expiry date of a product and warns before it expires', async () => {
    const base = `/clinics/${c('a').id}/inventory`
    const acid = crypto.randomUUID()
    const iso = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
    const save = await call('owner-a', 'PUT', `${base}/items/${acid}`, {
      name: 'Ácido glicólico',
      unit: 'ml',
      minQuantity: 0,
      initialQuantity: 30,
      tracksExpiry: true,
      expiresOn: iso(-2),
    })
    expect(save.statusCode).toBe(200)
    const find = async () =>
      (await call('owner-a', 'GET', base))
        .json()
        .items.find((entry: { id: string }) => entry.id === acid)
    expect(await find()).toMatchObject({ tracksExpiry: true, expiresOn: iso(-2) })
    expect((await find()).expiresIn).toBeLessThan(0)
    expect((await call('owner-a', 'GET', base)).json().expiring).toBeGreaterThanOrEqual(1)
    // Restocking with a new date replaces the date on the shelf.
    const restock = await call('owner-a', 'POST', `${base}/items/${acid}/movements`, {
      kind: 'in',
      quantity: 30,
      expiresOn: iso(200),
    })
    expect(restock.statusCode).toBe(200)
    expect(await find()).toMatchObject({ expiresOn: iso(200) })
    // Turning it off clears the date; another clinic cannot touch it.
    await call('owner-a', 'PUT', `${base}/items/${acid}`, {
      name: 'Ácido glicólico',
      unit: 'ml',
      minQuantity: 0,
      tracksExpiry: false,
      expiresOn: iso(10),
    })
    expect(await find()).toMatchObject({ tracksExpiry: false, expiresOn: null })
    expect(
      (
        await call('owner-b', 'POST', `${base}/items/${acid}/movements`, {
          kind: 'in',
          quantity: 1,
          expiresOn: iso(5),
        })
      ).statusCode,
    ).toBe(403)
  })

  it('renames and removes a stock category on every product', async () => {
    const base = `/clinics/${c('a').id}/inventory`
    for (const name of ['Luva P', 'Luva M'])
      await call('owner-a', 'PUT', `${base}/items/${crypto.randomUUID()}`, {
        name,
        category: 'EPI',
        unit: 'un',
        minQuantity: 0,
      })
    const rename = await call('owner-a', 'POST', `${base}/categories`, {
      from: 'EPI',
      to: 'Proteção',
    })
    expect(rename.json()).toEqual({ changed: 2 })
    expect(
      (
        await call('reception-b', 'POST', `/clinics/${c('a').id}/inventory/categories`, {
          from: 'Proteção',
          to: '',
        })
      ).statusCode,
    ).toBe(403)
    expect(
      (await call('owner-a', 'POST', `${base}/categories`, { from: 'Proteção', to: '' })).json(),
    ).toEqual({
      changed: 2,
    })
  })

  it('alerts at a percent of the last restock', async () => {
    const wax = crypto.randomUUID()
    const base = `/clinics/${c('a').id}/inventory`
    expect(
      (
        await call('owner-a', 'PUT', `${base}/items/${wax}`, {
          name: 'Cera quente',
          unit: 'g',
          minQuantity: 0,
          initialQuantity: 2000,
          packageSize: 1000,
          packageLabel: 'pote',
          alertPercent: 25,
          catalogId: 'cera-quente',
        })
      ).statusCode,
    ).toBe(200)
    const found = (await call('owner-a', 'GET', base))
      .json()
      .items.find((entry: { id: string }) => entry.id === wax)
    expect(found).toMatchObject({ minQuantity: 500, alertPercent: 25, catalogId: 'cera-quente' })
    // Restocking to 4 kg moves the alert to 1 kg.
    await call('owner-a', 'POST', `${base}/items/${wax}/movements`, { kind: 'in', quantity: 2000 })
    const after = (await call('owner-a', 'GET', base))
      .json()
      .items.find((entry: { id: string }) => entry.id === wax)
    expect(after).toMatchObject({ quantity: 4000, minQuantity: 1000, referenceQuantity: 4000 })
  })

  it('consumes the service recipe once when an appointment is completed', async () => {
    const wax = crypto.randomUUID()
    const spatula = crypto.randomUUID()
    const base = `/clinics/${c('a').id}`
    for (const [id, name, unit, initial] of [
      [wax, 'Cera roll-on', 'g', 500],
      [spatula, 'Espátula', 'un', 3],
    ] as const)
      await call('owner-a', 'PUT', `${base}/inventory/items/${id}`, {
        name,
        unit,
        minQuantity: 0,
        initialQuantity: initial,
        ...(id === wax ? { supplies: [{ serviceId: c('a').service, quantity: 40 }] } : {}),
      })
    // The recipe can also be set from the service, and another clinic cannot touch it.
    expect(
      (
        await call('owner-a', 'PUT', `${base}/catalog/services/${c('a').service}/supplies`, {
          items: [
            { itemId: wax, quantity: 40 },
            { itemId: spatula, quantity: 2 },
          ],
        })
      ).statusCode,
    ).toBe(200)
    expect(
      (
        await call('owner-b', 'PUT', `${base}/catalog/services/${c('a').service}/supplies`, {
          items: [],
        })
      ).statusCode,
    ).toBe(403)
    expect(
      (await call('owner-a', 'GET', `${base}/catalog/services/${c('a').service}/supplies`)).json()
        .supplies,
    ).toHaveLength(2)

    const today = (await call('owner-a', 'GET', `${base}/catalog`)).json().today as string
    const booked = await book('reception-a', c('a').service, `${today}T17:00`)
    const id = booked.json().appointment.id as string
    expect(
      (await call('reception-a', 'PUT', `${base}/appointments/${id}/check-in`, {})).statusCode,
    ).toBe(200)
    const plan = (await call('reception-a', 'GET', `${base}/appointments/${id}/supplies`)).json()
    expect(plan.supplies).toEqual([
      expect.objectContaining({ itemId: wax, quantity: 40, stock: 500, consumed: null }),
      expect.objectContaining({ itemId: spatula, quantity: 2, stock: 3, consumed: null }),
    ])
    // Reception cannot record money: the whole completion is refused, nothing is consumed.
    const supplies = [
      { itemId: wax, quantity: 55 },
      { itemId: spatula, quantity: 2 },
    ]
    expect(
      (
        await call('reception-a', 'PUT', `${base}/appointments/${id}/complete`, {
          supplies,
          payment: { amountCents: 5000, method: 'pix', description: 'Parcial' },
        })
      ).statusCode,
    ).toBe(403)
    expect(
      (
        await call('owner-a', 'PUT', `${base}/appointments/${id}/complete`, {
          supplies,
          payment: { amountCents: 5000, method: 'pix', description: 'Parcial' },
        })
      ).json(),
    ).toEqual({ completed: true, consumed: 2 })
    // Completing again never consumes twice.
    expect(
      (
        await call('owner-a', 'PUT', `${base}/appointments/${id}/complete`, {
          supplies,
          payment: null,
        })
      ).json().consumed,
    ).toBe(0)
    const stock = (await call('owner-a', 'GET', `${base}/inventory`)).json()
    const level = (itemId: string) =>
      stock.items.find((entry: { id: string }) => entry.id === itemId).quantity
    expect([level(wax), level(spatula)]).toEqual([445, 1])

    // Paid in part: the rest is still "a receber"; more than the price is refused.
    const finance = (await call('owner-a', 'GET', `${base}/finance`)).json()
    expect(
      finance.pending.find((entry: { appointmentId: string }) => entry.appointmentId === id),
    ).toMatchObject({ priceCents: 5000, paidCents: 5000 })
    const rest = {
      kind: 'income',
      occurredOn: today,
      description: 'Resto',
      method: 'pix',
      appointmentId: id,
    }
    expect(
      (await call('owner-a', 'POST', `${base}/finance/entries`, { ...rest, amountCents: 6000 }))
        .statusCode,
    ).toBe(409)
    expect(
      (await call('owner-a', 'POST', `${base}/finance/entries`, { ...rest, amountCents: 5000 }))
        .statusCode,
    ).toBe(200)
    // Canceling keeps the reason, and the agenda shows it.
    const other = (await book('owner-a', c('a').service, `${today}T19:00`)).json().appointment
      .id as string
    expect(
      (
        await call('owner-a', 'PUT', `${base}/appointments/${other}/status`, {
          status: 'canceled',
          note: 'Cliente pediu para remarcar mês que vem',
        })
      ).statusCode,
    ).toBe(200)
    const dashboard = (await call('owner-a', 'GET', `${base}/dashboard`)).json()
    expect(
      dashboard.appointments.find((entry: { id: string }) => entry.id === other),
    ).toMatchObject({ status: 'canceled', statusNote: 'Cliente pediu para remarcar mês que vem' })
    expect(dashboard.appointments.find((entry: { id: string }) => entry.id === id)).toMatchObject({
      paid: true,
      paidCents: 10000,
      checkedInAt: expect.any(String),
    })
  })

  it('lists birthdays of the month for marketing', async () => {
    const marketing = (await call('owner-a', 'GET', `/clinics/${c('a').id}/marketing`)).json()
    expect(marketing.birthdays.map((b: { name: string }) => b.name)).toEqual(['Cliente a'])
    expect(marketing.site).toMatchObject({ slug: c('a').slug, published: true })
  })
})
