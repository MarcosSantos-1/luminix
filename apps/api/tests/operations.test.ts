import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { applyMigrations, type SqlConnection } from '../src/shared/database/migrations.js'

let db: PGlite
let connection: SqlConnection
let app: Awaited<ReturnType<typeof buildApp>>
let clinicA: string
let clinicB: string
let serviceA: string
let serviceB: string
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
  const identityA = String(
    (await connection.query('SELECT * FROM luminix.resolve_staff_identity($1)', ['agenda-a']))
      .rows[0].identity_id,
  )
  const identityB = String(
    (await connection.query('SELECT * FROM luminix.resolve_staff_identity($1)', ['agenda-b']))
      .rows[0].identity_id,
  )
  clinicA = String(
    (
      await connection.query('SELECT * FROM luminix.bootstrap_owner_clinic($1, $2)', [
        identityA,
        'Agenda A',
      ])
    ).rows[0].clinic_id,
  )
  clinicB = String(
    (
      await connection.query('SELECT * FROM luminix.bootstrap_owner_clinic($1, $2)', [
        identityB,
        'Agenda B',
      ])
    ).rows[0].clinic_id,
  )
  await connection.query("SELECT set_config('luminix.clinic_id', $1, false)", [clinicA])
  serviceA = String(
    (
      await connection.query(
        "INSERT INTO luminix.services (clinic_id, name, price_cents, duration_minutes) VALUES ($1, 'Serviço A', 5000, 60) RETURNING id",
        [clinicA],
      )
    ).rows[0].id,
  )
  await connection.query("SELECT set_config('luminix.clinic_id', $1, false)", [clinicB])
  serviceB = String(
    (
      await connection.query(
        "INSERT INTO luminix.services (clinic_id, name, price_cents, duration_minutes) VALUES ($1, 'Serviço B', 5000, 60) RETURNING id",
        [clinicB],
      )
    ).rows[0].id,
  )
  await db.exec('SET ROLE luminix_api')
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
    headers: { authorization: `Bearer ${uid}`, 'content-type': 'application/json' },
    payload: payload ? JSON.stringify(payload) : undefined,
  })
}

const weekly = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  isAvailable: weekday === 1,
  periods: weekday === 1 ? [{ start: '09:00', end: '18:00' }] : [],
}))

describe('clinic clients and manager scheduling', () => {
  it('creates clinic-local clients without leaking them across tenants', async () => {
    const created = await call('agenda-a', 'POST', clinicA, 'clients', {
      name: 'Cliente A',
      phone: '+5511999990001',
      email: 'CLIENTE.A@EXAMPLE.COM',
    })
    expect(created.statusCode).toBe(201)
    clientA = created.json().client.id
    expect(created.json().client.contact_email).toBe('cliente.a@example.com')
    expect((await call('agenda-b', 'GET', clinicA, 'clients')).statusCode).toBe(403)
    expect((await call('agenda-b', 'GET', clinicB, 'clients')).json().clients).toEqual([])
    expect(
      (await call('agenda-a', 'GET', clinicA, 'clients?q=99990001')).json().clients,
    ).toHaveLength(1)
  })

  it('keeps client booking rules strict and requires explicit manager warning confirmation', async () => {
    expect(
      (await call('agenda-a', 'PUT', clinicA, 'availability', { mode: 'weekly', days: weekly }))
        .statusCode,
    ).toBe(200)
    const ordinary = await call('agenda-a', 'POST', clinicA, 'appointments', {
      clientId: clientA,
      serviceId: serviceA,
      localStartsAt: '2030-01-07T10:00',
    })
    expect(ordinary.statusCode).toBe(201)
    expect(ordinary.json().warnings).toEqual([])

    const outside = await call('agenda-a', 'POST', clinicA, 'appointments', {
      clientId: clientA,
      serviceId: serviceA,
      localStartsAt: '2030-01-07T07:00',
    })
    expect(outside.statusCode).toBe(409)
    expect(outside.json().warnings.map((warning: { code: string }) => warning.code)).toEqual([
      'outside_availability',
    ])
    expect(
      (
        await call('agenda-a', 'POST', clinicA, 'appointments', {
          clientId: clientA,
          serviceId: serviceA,
          localStartsAt: '2030-01-07T07:00',
          confirmedWarnings: ['outside_availability'],
        })
      ).statusCode,
    ).toBe(201)

    const overlap = await call('agenda-a', 'POST', clinicA, 'appointments', {
      clientId: clientA,
      serviceId: serviceA,
      localStartsAt: '2030-01-07T10:30',
    })
    expect(overlap.statusCode).toBe(409)
    expect(
      overlap.json().warnings.some((warning: { code: string }) => warning.code === 'overlap'),
    ).toBe(true)
    expect(
      (
        await call('agenda-a', 'POST', clinicA, 'appointments', {
          clientId: clientA,
          serviceId: serviceA,
          localStartsAt: '2030-01-07T10:30',
          confirmedWarnings: ['overlap'],
        })
      ).statusCode,
    ).toBe(201)
  })

  it('rejects cross-clinic resources and returns only the selected clinic agenda', async () => {
    expect(
      (
        await call('agenda-a', 'POST', clinicA, 'appointments', {
          clientId: clientA,
          serviceId: serviceB,
          localStartsAt: '2030-01-07T12:00',
        })
      ).statusCode,
    ).toBe(400)
    const agenda = await call(
      'agenda-a',
      'GET',
      clinicA,
      'agenda?from=2030-01-07T00:00:00.000Z&to=2030-01-08T23:59:59.999Z',
    )
    expect(agenda.statusCode).toBe(200)
    expect(agenda.json().appointments).toHaveLength(3)
    expect(
      agenda
        .json()
        .appointments.every((item: { service_id: string }) => item.service_id === serviceA),
    ).toBe(true)
  })
})
