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
  await db.query("SELECT set_config('luminix.clinic_id', $1, false)", [otherClinic])
  expect(
    (await db.query('SELECT name FROM luminix.resources WHERE clinic_id = $1', [clinic])).rows,
  ).toHaveLength(0)
})
