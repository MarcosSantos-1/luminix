import { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { applyMigrations, type SqlConnection } from '../src/shared/database/migrations.js'

let db: PGlite
let connection: SqlConnection
let app: Awaited<ReturnType<typeof buildApp>>
let clinicA: string
let clinicB: string
let serviceA: string
let deviceServiceA: string
let clientA: string

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
  clinicA = await clinic(await identity('pack-a'), 'Pacotes A')
  clinicB = await clinic(await identity('pack-b'), 'Pacotes B')
  await connection.query("SELECT set_config('luminix.clinic_id', $1, false)", [clinicA])
  serviceA = String(
    (
      await connection.query(
        `INSERT INTO luminix.services (clinic_id, name, price_cents, duration_minutes)
         VALUES ($1, 'Drenagem', 15000, 60) RETURNING id`,
        [clinicA],
      )
    ).rows[0].id,
  )
  deviceServiceA = String(
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
  resource: string,
  payload?: object,
) {
  return app.inject({
    method,
    url: `/clinics/${clinic}/${resource}`,
    headers: payload
      ? { authorization: `Bearer ${uid}`, 'content-type': 'application/json' }
      : { authorization: `Bearer ${uid}` },
    payload: payload ? JSON.stringify(payload) : undefined,
  })
}

const everyDay = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  isAvailable: true,
  periods: [{ start: '08:00', end: '20:00' }],
}))

describe('anamnese preenchida pela equipe', () => {
  it('saves a complete record locally and shows only a summary in the list', async () => {
    const created = await call('pack-a', 'POST', clinicA, 'clients', { name: 'Ana Pacote' })
    expect(created.statusCode).toBe(201)
    clientA = created.json().client.id
    expect(
      (
        await call('pack-a', 'PUT', clinicA, `clients/${clientA}/anamnesis`, {
          level: 1,
          answers: { sex: 'female', birthDate: '1990-05-10' },
          consent: true,
        })
      ).statusCode,
    ).toBe(400)
    const saved = await call('pack-a', 'PUT', clinicA, `clients/${clientA}/anamnesis`, {
      level: 1,
      answers: {
        sex: 'female',
        birthDate: '1990-05-10',
        allergies: false,
        cosmeticAllergy: false,
      },
      consent: true,
    })
    expect(saved.statusCode).toBe(200)
    expect(saved.json().anamnesis.by).toBe('staff')
    const list = (await call('pack-a', 'GET', clinicA, 'clients')).json().clients
    expect(list[0].anamnesis).toMatchObject({ level: 1, by: 'staff' })
    expect(list[0].anamnesis.answers).toBeUndefined()
    const detail = (await call('pack-a', 'GET', clinicA, `clients/${clientA}`)).json()
    expect(detail.anamnesis.record.answers.allergies).toBe(false)
    expect(
      (
        await call('pack-b', 'PUT', clinicA, `clients/${clientA}/anamnesis`, {
          level: 1,
          answers: {},
          consent: true,
        })
      ).statusCode,
    ).toBe(403)
  })
})

describe('pacotes', () => {
  it('sells a package, uses a session per appointment and refuses when it runs out', async () => {
    const packageId = randomUUID()
    expect(
      (
        await call('pack-a', 'PUT', clinicA, `catalog/packages/${packageId}`, {
          serviceId: serviceA,
          name: 'Drenagem 2 sessões',
          sessions: 2,
          priceCents: 25000,
          validityDays: 90,
        })
      ).statusCode,
    ).toBe(200)
    const extras = (await call('pack-a', 'GET', clinicA, 'catalog/extras')).json()
    expect(extras.packages).toHaveLength(1)
    expect((await call('pack-b', 'GET', clinicB, 'catalog/extras')).json().packages).toEqual([])

    expect(
      (
        await call('pack-b', 'POST', clinicB, `clients/${clientA}/packages`, {
          packageId,
          soldOn: '2030-02-01',
        })
      ).statusCode,
    ).toBe(400)
    const sold = await call('pack-a', 'POST', clinicA, `clients/${clientA}/packages`, {
      packageId,
      soldOn: '2030-02-01',
      registerIncome: true,
      method: 'pix',
    })
    expect(sold.statusCode).toBe(201)
    expect(sold.json().financeEntry).toBeTruthy()
    const clientPackage = sold.json().id

    await call('pack-a', 'PUT', clinicA, 'availability', { mode: 'weekly', days: everyDay })
    for (const day of ['04', '05']) {
      const booked = await call('pack-a', 'POST', clinicA, 'appointments', {
        clientId: clientA,
        serviceId: serviceA,
        localStartsAt: `2030-02-${day}T10:00`,
        clientPackageId: clientPackage,
      })
      expect(booked.statusCode).toBe(201)
    }
    const packages = (await call('pack-a', 'GET', clinicA, `clients/${clientA}/packages`)).json()
      .packages
    expect(packages[0]).toMatchObject({ sessionsTotal: 2, used: 2, left: 0, status: 'finished' })
    const agenda = (
      await call(
        'pack-a',
        'GET',
        clinicA,
        'agenda?from=2030-02-04T00:00:00.000Z&to=2030-02-05T23:59:59.999Z',
      )
    ).json()
    expect(agenda.appointments.every((row: { price_cents: number }) => row.price_cents === 0)).toBe(
      true,
    )
    const extra = await call('pack-a', 'POST', clinicA, 'appointments', {
      clientId: clientA,
      serviceId: serviceA,
      localStartsAt: '2030-02-06T10:00',
      clientPackageId: clientPackage,
    })
    expect(extra.statusCode).toBe(409)
    expect(
      (await call('pack-a', 'POST', clinicA, `client-packages/${clientPackage}/cancel`)).statusCode,
    ).toBe(200)
  })

  it('sells a combo: each visit does every service and lasts what the combo says', async () => {
    const comboId = randomUUID()
    const save = (body: object) =>
      call('pack-a', 'PUT', clinicA, `catalog/packages/${comboId}`, {
        name: 'Combo verão',
        priceCents: 40000,
        validityDays: 90,
        ...body,
      })
    const both = [
      { serviceId: serviceA, sessions: 2 },
      { serviceId: deviceServiceA, sessions: 2 },
    ]
    // A combo needs two services, its sessions and its duration.
    expect(
      (
        await save({
          kind: 'combo',
          sessions: 2,
          durationMinutes: 90,
          items: [{ serviceId: serviceA, sessions: 2 }],
        })
      ).statusCode,
    ).toBe(400)
    expect((await save({ kind: 'combo', sessions: 2, items: both })).statusCode).toBe(400)
    expect(
      (await save({ kind: 'combo', sessions: 2, durationMinutes: 90, items: both })).statusCode,
    ).toBe(200)
    const combo = (await call('pack-a', 'GET', clinicA, 'catalog/extras'))
      .json()
      .packages.find((item: { id: string }) => item.id === comboId)
    expect(combo).toMatchObject({ kind: 'combo', sessions: 2, durationMinutes: 90 })
    const sold = await call('pack-a', 'POST', clinicA, `clients/${clientA}/packages`, {
      packageId: comboId,
      soldOn: '2030-03-01',
    })
    expect(sold.statusCode).toBe(201)
    const clientCombo = sold.json().id
    const book = (day: string) =>
      call('pack-a', 'POST', clinicA, 'appointments', {
        clientId: clientA,
        serviceId: serviceA,
        localStartsAt: `2030-04-${day}T10:00`,
        clientPackageId: clientCombo,
      })
    const first = await book('04')
    expect(first.statusCode).toBe(201)
    // 90 minutes: the combo's time, not Drenagem's 60.
    const appointment = first.json().appointment
    expect(Date.parse(appointment.ends_at) - Date.parse(appointment.starts_at)).toBe(90 * 60000)
    expect((await book('05')).statusCode).toBe(201)
    expect((await book('06')).statusCode).toBe(409)
    const mine = (await call('pack-a', 'GET', clinicA, `clients/${clientA}/packages`))
      .json()
      .packages.find((item: { id: string }) => item.id === clientCombo)
    expect(mine).toMatchObject({
      kind: 'combo',
      durationMinutes: 90,
      sessionsTotal: 2,
      used: 2,
      left: 0,
      status: 'finished',
    })
    const agenda = (
      await call(
        'pack-a',
        'GET',
        clinicA,
        'agenda?from=2030-04-04T00:00:00.000Z&to=2030-04-04T23:59:59.999Z',
      )
    ).json()
    expect(agenda.appointments[0].combo_name).toBe('Combo verão')
    // Stock: every treatment's recipe, summed; the per-visit disposables count once.
    const product = (name: string, category: string, both: boolean) =>
      call('pack-a', 'PUT', clinicA, `inventory/items/${randomUUID()}`, {
        name,
        category,
        unit: name === 'Luvas' ? 'un' : 'ml',
        minQuantity: 0,
        initialQuantity: 500,
        supplies: [
          { serviceId: serviceA, quantity: name === 'Luvas' ? 2 : 10 },
          ...(both ? [{ serviceId: deviceServiceA, quantity: name === 'Luvas' ? 2 : 5 }] : []),
        ],
      })
    expect((await product('Gel', 'Estética', true)).statusCode).toBe(200)
    expect((await product('Luvas', 'Descartáveis', true)).statusCode).toBe(200)
    const supplies = (
      await call('pack-a', 'GET', clinicA, `appointments/${appointment.id}/supplies`)
    ).json().supplies as { name: string; quantity: number }[]
    expect(Object.fromEntries(supplies.map((row) => [row.name, row.quantity]))).toEqual({
      Gel: 15,
      Luvas: 2,
    })
  })
})

describe('aparelhos alugados', () => {
  it('warns the manager outside the rental days and books freely inside them', async () => {
    const created = await call('pack-a', 'POST', clinicA, 'catalog/equipment', {
      name: 'Laser alugado',
      supplier: 'Loja X',
      defaultCostCents: 80000,
      serviceIds: [deviceServiceA],
    })
    expect(created.statusCode).toBe(201)
    const equipment = created.json().id
    const outside = await call('pack-a', 'POST', clinicA, 'appointments', {
      clientId: clientA,
      serviceId: deviceServiceA,
      localStartsAt: '2030-03-04T10:00',
    })
    expect(outside.statusCode).toBe(409)
    expect(outside.json().warnings.map((item: { code: string }) => item.code)).toContain(
      'equipment',
    )
    const rental = await call('pack-a', 'POST', clinicA, `catalog/equipment/${equipment}/rentals`, {
      startsOn: '2030-03-04',
      endsOn: '2030-03-04',
      costCents: 80000,
      registerExpense: true,
    })
    expect(rental.statusCode).toBe(201)
    expect(rental.json().financeEntry).toBeTruthy()
    const inside = await call('pack-a', 'POST', clinicA, 'appointments', {
      clientId: clientA,
      serviceId: deviceServiceA,
      localStartsAt: '2030-03-04T11:00',
    })
    expect(inside.statusCode).toBe(201)
    expect(
      (
        await call('pack-b', 'POST', clinicB, `catalog/equipment/${equipment}/rentals`, {
          startsOn: '2030-03-05',
          endsOn: '2030-03-05',
        })
      ).statusCode,
    ).toBe(404)
    const extras = (await call('pack-a', 'GET', clinicA, 'catalog/extras')).json()
    expect(extras.equipment[0]).toMatchObject({
      name: 'Laser alugado',
      serviceIds: [deviceServiceA],
    })
    expect(extras.equipment[0].rentals[0]).toMatchObject({
      startsOn: '2030-03-04',
      inFinance: true,
    })
    expect(
      (
        await call(
          'pack-a',
          'POST',
          clinicA,
          `catalog/rentals/${extras.equipment[0].rentals[0].id}/remove`,
        )
      ).json(),
    ).toMatchObject({ removed: true, financeEntryVoided: true })
  })

  it('deletes the equipment with its rentals, only inside its own clinic', async () => {
    const created = await call('pack-a', 'POST', clinicA, 'catalog/equipment', {
      name: 'Laser para excluir',
      serviceIds: [deviceServiceA],
    })
    const equipment = created.json().id
    await call('pack-a', 'POST', clinicA, `catalog/equipment/${equipment}/rentals`, {
      startsOn: '2030-05-06',
      endsOn: '2030-05-06',
      costCents: 50000,
      registerExpense: true,
    })
    expect(
      (await call('pack-b', 'POST', clinicB, `catalog/equipment/${equipment}/remove`)).statusCode,
    ).toBe(404)
    const removed = await call('pack-a', 'POST', clinicA, `catalog/equipment/${equipment}/remove`)
    expect(removed.statusCode).toBe(200)
    expect(removed.json()).toMatchObject({ deleted: true, financeEntriesVoided: 1 })
    const extras = (await call('pack-a', 'GET', clinicA, 'catalog/extras')).json()
    expect(extras.equipment.some((item: { id: string }) => item.id === equipment)).toBe(false)
    expect(
      (await call('pack-a', 'POST', clinicA, `catalog/equipment/${equipment}/remove`)).statusCode,
    ).toBe(404)
  })
})
