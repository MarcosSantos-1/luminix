import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { applyMigrations, type SqlConnection } from '../src/shared/database/migrations.js'

// ADR-035: changing hours, closing days or making a rental day exclusive lists the clients who
// lose their time (409) and cancels them only when the manager confirms.
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
  clinicA = await clinic(await identity('impact-a'), 'Agenda A')
  clinicB = await clinic(await identity('impact-b'), 'Agenda B')
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

async function book(localStartsAt: string, serviceId = facial, confirmedWarnings?: string[]) {
  return call('impact-a', 'POST', clinicA, 'appointments', {
    clientId: client,
    serviceId,
    localStartsAt,
    ...(confirmedWarnings ? { confirmedWarnings } : {}),
  })
}

async function status(id: string) {
  return (
    await connection.query(
      'SELECT status, cancellation_origin, status_note FROM luminix.appointments WHERE id = $1',
      [id],
    )
  ).rows[0]
}

describe('cancelamentos por mudança de agenda', () => {
  it('lists and then cancels the clients a shorter routine leaves out', async () => {
    client = (
      await call('impact-a', 'POST', clinicA, 'clients', {
        name: 'Bia Afetada',
        phone: '+5511999990000',
        email: 'bia@example.com',
      })
    ).json().client.id
    const all = [{ start: '08:00', end: '20:00' }]
    expect(
      (await call('impact-a', 'PUT', clinicA, 'availability', { mode: 'weekly', days: week(all) }))
        .statusCode,
    ).toBe(200)
    // 2030-05-06 is a Monday.
    const late = (await book('2030-05-06T17:00')).json().appointment.id
    const early = (await book('2030-05-06T09:00')).json().appointment.id
    // Booked outside the hours on purpose: never canceled by a later change.
    const outside = await book('2030-05-06T21:00', facial, ['outside_availability'])
    expect(outside.statusCode).toBe(201)

    const shorter = week([{ start: '08:00', end: '12:00' }])
    const preview = await call('impact-a', 'PUT', clinicA, 'availability', {
      mode: 'weekly',
      days: shorter,
    })
    expect(preview.statusCode).toBe(409)
    expect(preview.json()).toMatchObject({
      error: 'Schedule impact',
      total: 1,
      affected: [
        {
          clientId: client,
          name: 'Bia Afetada',
          phone: '+5511999990000',
          appointments: [
            { id: late, date: '2030-05-06', time: '17:00', service: 'Limpeza de pele' },
          ],
        },
      ],
    })
    // Rolled back: hours and appointment unchanged.
    expect((await status(late)).status).toBe('confirmed')
    const weekly = await connection.query(
      'SELECT periods FROM luminix.weekly_availability WHERE clinic_id = $1 AND weekday = 1',
      [clinicA],
    )
    expect(weekly.rows[0].periods).toEqual(all)

    // Another clinic cannot run it.
    expect(
      (
        await call('impact-b', 'PUT', clinicA, 'availability', {
          mode: 'weekly',
          days: shorter,
          confirmCancellations: true,
        })
      ).statusCode,
    ).toBe(403)

    const confirmed = await call('impact-a', 'PUT', clinicA, 'availability', {
      mode: 'weekly',
      days: shorter,
      confirmCancellations: true,
    })
    expect(confirmed.statusCode).toBe(200)
    expect(confirmed.json().canceledAppointments).toBe(1)
    expect(await status(late)).toMatchObject({
      status: 'canceled',
      cancellation_origin: 'schedule_change',
      status_note: 'O espaço mudou o horário de atendimento.',
    })
    expect((await status(early)).status).toBe('confirmed')
    expect((await status(outside.json().appointment.id)).status).toBe('confirmed')
  })

  it('closing one day and a closure period also list who is affected', async () => {
    const tuesday = (await book('2030-05-07T10:00')).json().appointment.id
    const closeDay = {
      mode: 'override',
      date: '2030-05-07',
      isAvailable: false,
      periods: [],
      reason: 'Dedetização',
    }
    const preview = await call('impact-a', 'PUT', clinicA, 'availability', closeDay)
    expect(preview.statusCode).toBe(409)
    expect(preview.json().affected[0].appointments[0].id).toBe(tuesday)

    const wednesday = (await book('2030-05-08T10:00')).json().appointment.id
    const closure = { startsOn: '2030-05-08', endsOn: '2030-05-09', kind: 'maintenance' }
    const listed = await call('impact-a', 'POST', clinicA, 'closures', closure)
    expect(listed.statusCode).toBe(409)
    expect(listed.json().total).toBe(1)
    expect(
      (await connection.query('SELECT count(*)::int AS n FROM luminix.schedule_closures')).rows[0]
        .n,
    ).toBe(0)
    const saved = await call('impact-a', 'POST', clinicA, 'closures', {
      ...closure,
      confirmCancellations: true,
    })
    expect(saved.statusCode).toBe(201)
    expect(saved.json().canceledAppointments).toBe(1)
    expect((await status(wednesday)).status).toBe('canceled')
    expect((await status(tuesday)).status).toBe('confirmed')
  })

  it('an exclusive rental day keeps only the device treatments', async () => {
    const device = (
      await call('impact-a', 'POST', clinicA, 'catalog/equipment', {
        name: 'Laser Lumi',
        serviceIds: [laser],
      })
    ).json().id
    const rental = await call('impact-a', 'POST', clinicA, `catalog/equipment/${device}/rentals`, {
      startsOn: '2030-05-13',
      endsOn: '2030-05-13',
    })
    expect(rental.statusCode).toBe(201)
    const rentalId = rental.json().id
    // Another clinic cannot see or switch this rental.
    expect(
      (
        await call('impact-b', 'POST', clinicB, `catalog/rentals/${rentalId}/exclusive`, {
          exclusive: true,
        })
      ).statusCode,
    ).toBe(404)
    const other = (await book('2030-05-13T10:00')).json().appointment.id
    const withDevice = (await book('2030-05-13T11:00', laser)).json().appointment.id

    const preview = await call(
      'impact-a',
      'POST',
      clinicA,
      `catalog/rentals/${rentalId}/exclusive`,
      {
        exclusive: true,
      },
    )
    expect(preview.statusCode).toBe(409)
    expect(preview.json().affected[0].appointments.map((item: { id: string }) => item.id)).toEqual([
      other,
    ])
    const done = await call('impact-a', 'POST', clinicA, `catalog/rentals/${rentalId}/exclusive`, {
      exclusive: true,
      confirmCancellations: true,
    })
    expect(done.statusCode).toBe(200)
    expect(await status(other)).toMatchObject({ status: 'canceled' })
    expect((await status(withDevice)).status).toBe('confirmed')

    // The manager may still book another treatment there, after confirming.
    const warned = await book('2030-05-13T10:00')
    expect(warned.statusCode).toBe(409)
    expect(warned.json().warnings.map((item: { code: string }) => item.code)).toContain('exclusive')
    expect((await book('2030-05-13T10:00', facial, ['exclusive'])).statusCode).toBe(201)

    const extras = (await call('impact-a', 'GET', clinicA, 'catalog/extras')).json()
    const listed = extras.equipment.find((item: { id: string }) => item.id === device)
    expect(listed.rentals[0]).toMatchObject({ id: rentalId, exclusive: true })
  })

  it('a new exclusive rental asks before canceling', async () => {
    const device = (
      await call('impact-a', 'POST', clinicA, 'catalog/equipment', {
        name: 'Ultrassom',
        serviceIds: [laser],
      })
    ).json().id
    const other = (await book('2030-05-14T10:00')).json().appointment.id
    const body = { startsOn: '2030-05-14', endsOn: '2030-05-14', exclusive: true }
    const preview = await call(
      'impact-a',
      'POST',
      clinicA,
      `catalog/equipment/${device}/rentals`,
      body,
    )
    expect(preview.statusCode).toBe(409)
    expect(
      (
        await connection.query(
          'SELECT count(*)::int AS n FROM luminix.resource_rentals WHERE resource_id = $1',
          [device],
        )
      ).rows[0].n,
    ).toBe(0)
    const saved = await call('impact-a', 'POST', clinicA, `catalog/equipment/${device}/rentals`, {
      ...body,
      confirmCancellations: true,
    })
    expect(saved.statusCode).toBe(201)
    expect(saved.json().canceledAppointments).toBe(1)
    expect((await status(other)).status).toBe('canceled')
  })
})
