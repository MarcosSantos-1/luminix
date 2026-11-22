import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { applyMigrations, type SqlConnection } from '../src/shared/database/migrations.js'

let db: PGlite
let app: Awaited<ReturnType<typeof buildApp>>
let clinic: string
let otherClinic: string

beforeAll(async () => {
  db = new PGlite()
  const connection: SqlConnection = {
    async query(sql, values) {
      if (values) return db.query(sql, values)
      return { rows: (await db.exec(sql)).at(-1)?.rows ?? [] }
    },
  }
  await applyMigrations(connection)
  const clinics: string[] = []
  for (const uid of ['equipment-owner', 'equipment-other']) {
    const identity = (
      await connection.query('SELECT * FROM luminix.resolve_staff_identity($1)', [uid])
    ).rows[0].identity_id
    clinics.push(
      String(
        (
          await connection.query('SELECT * FROM luminix.bootstrap_owner_clinic($1, $2)', [
            identity,
            'Clínica de teste',
          ])
        ).rows[0].clinic_id,
      ),
    )
  }
  ;[clinic, otherClinic] = clinics
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
  method: 'GET' | 'PUT' | 'POST',
  suffix = 'onboarding',
  body?: object,
  target = clinic,
) {
  return app.inject({
    method,
    url: `/clinics/${target}/${suffix}`,
    headers: { authorization: 'Bearer equipment-owner' },
    payload: body,
  })
}

it('persists dismissal, resumes equipment selections and materializes one shared tenant resource', async () => {
  const payload = (await call('GET')).json().draft.payload
  payload.preferences.specialTreatmentsDismissed = true
  expect(
    (await call('PUT', 'onboarding', { version: 0, step: 'services', payload })).statusCode,
  ).toBe(200)
  expect((await call('GET')).json().draft.payload.preferences.specialTreatmentsDismissed).toBe(true)
  expect((await call('GET', 'onboarding', undefined, otherClinic)).statusCode).toBe(403)

  payload.ownerName = 'Gestora teste'
  payload.email = 'equipment@example.com'
  payload.phone = '+5511999990001'
  payload.occupations = ['Depilação']
  payload.preferences.specialTreatmentsDismissed = false
  payload.services = ['Axilas', 'Pernas'].map((area, index) => ({
    id: `11111111-1111-4111-8111-11111111111${index}`,
    name: `Laser ${area}`,
    category: 'Depilação',
    description: '',
    priceCents: 10000,
    priceType: 'fixed',
    durationMinutes: 60,
    bookingMode: 'manual_release',
    resourceName: 'Laser alugado',
    audience: 'all',
    sensitive: false,
    cancellationHours: null,
  }))
  payload.professionals = [
    {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Gestora teste',
      role: 'Profissional',
      gender: 'female',
      audience: 'all',
      serviceIds: payload.services.map((service: { id: string }) => service.id),
      serviceNames: payload.services.map((service: { name: string }) => service.name),
    },
  ]
  const saved = await call('PUT', 'onboarding', { version: 1, step: 'services', payload })
  expect(saved.statusCode).toBe(200)
  const resumed = (await call('GET')).json().draft.payload
  expect(resumed.services).toEqual(payload.services)
  expect(resumed.preferences.specialTreatmentsDismissed).toBe(false)
  expect((await call('POST', 'onboarding/complete', { version: 2 })).statusCode).toBe(200)
  await db.query("SELECT set_config('luminix.clinic_id', $1, false)", [clinic])
  const resources = (
    await db.query('SELECT name, availability_mode FROM luminix.resources WHERE clinic_id = $1', [
      clinic,
    ])
  ).rows
  expect(resources).toEqual([{ name: 'Laser alugado', availability_mode: 'manual_release' }])
  expect(
    (
      await db.query('SELECT service_id FROM luminix.service_resources WHERE clinic_id = $1', [
        clinic,
      ])
    ).rows,
  ).toHaveLength(2)
  expect(
    (
      await db.query<{ booking_mode: string }>(
        'SELECT booking_mode FROM luminix.services WHERE clinic_id = $1',
        [clinic],
      )
    ).rows.every((row) => row.booking_mode === 'manual_release'),
  ).toBe(true)
  const equipment = (await call('GET', 'catalog/extras')).json().equipment[0]
  expect((await call('GET', 'dashboard')).json().missingRentals).toEqual([
    'Laser Axilas',
    'Laser Pernas',
  ])
  expect(
    (
      await call('POST', `catalog/equipment/${equipment.id}/rentals`, {
        startsOn: '2030-02-04',
        endsOn: '2030-02-05',
      })
    ).statusCode,
  ).toBe(201)
  expect((await call('GET', 'dashboard')).json().missingRentals).toEqual([])
  const notice = (await call('GET', 'notices'))
    .json()
    .notices.find(
      (n: { action?: { equipmentId?: string } }) => n.action?.equipmentId === equipment.id,
    )
  expect(notice.action).toEqual({
    label: 'Ir',
    target: 'servicos',
    tab: 'equipment',
    equipmentId: equipment.id,
  })
  const agenda = (
    await call('GET', 'agenda?from=2030-02-04T00:00:00Z&to=2030-02-06T00:00:00Z')
  ).json()
  expect(agenda.services.map((item: { rental_dates: string[] }) => item.rental_dates)).toEqual([
    ['2030-02-04', '2030-02-05'],
    ['2030-02-04', '2030-02-05'],
  ])
  const today = (await call('GET', 'dashboard')).json().today
  expect(
    (
      await call('PUT', 'availability', {
        mode: 'override',
        date: today,
        isAvailable: true,
        periods: [
          { start: '09:00', end: '12:00' },
          { start: '13:00', end: '21:00' },
        ],
      })
    ).statusCode,
  ).toBe(200)
  const draft = await call('POST', `catalog/equipment/${equipment.id}/rentals`, {
    startsOn: today,
    endsOn: today,
    available: false,
  })
  expect(draft.statusCode).toBe(201)
  const monthlyNotices = async () =>
    (await call('GET', 'notices')).json().notices.map((n: { id: string }) => n.id)
  expect(await monthlyNotices()).toContain(notice.id)
  expect(
    (await call('POST', `catalog/rentals/${draft.json().id}/availability`, { available: true }))
      .statusCode,
  ).toBe(200)
  expect(await monthlyNotices()).not.toContain(notice.id)
  const released = await call('GET', `agenda?from=${today}T00:00:00Z&to=${today}T23:59:59Z`)
  expect(released.json().services[0].rental_hours[today]).toEqual([
    [540, 720],
    [780, 1260],
  ])
  await db.query("SELECT set_config('luminix.clinic_id', $1, false)", [otherClinic])
  expect(
    (await db.query('SELECT name FROM luminix.resources WHERE clinic_id = $1', [clinic])).rows,
  ).toHaveLength(0)
})
