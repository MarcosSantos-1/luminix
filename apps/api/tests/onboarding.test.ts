import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { applyMigrations, type SqlConnection } from '../src/shared/database/migrations.js'

let db: PGlite
let connection: SqlConnection
let app: Awaited<ReturnType<typeof buildApp>>
let clinicA: string
let clinicB: string
const payload = {
  name: 'Clínica A final',
  ownerName: 'Ana Souza',
  email: 'ana.a@example.com',
  phone: '+5511999990001',
  clinic: {
    foundedYear: '2020',
    whatsapp: '+5511999990001',
    instagram: '@clinicaa',
    facebook: '',
    website: '',
    taxId: '',
    addressLine: 'Rua A',
    addressNumber: '10',
    addressNote: 'Sala 2',
    city: 'São Paulo',
    state: 'SP',
    postalCode: '01001000',
  },
  occupations: ['Estética facial'],
  services: [
    {
      category: 'Estética facial',
      name: 'Limpeza de pele',
      description: 'Limpeza completa',
      priceCents: 9000,
      durationMinutes: 60,
      priceType: 'fixed',
      bookingMode: 'instant',
      audience: 'all',
      resourceName: '',
      cancellationHours: null,
    },
  ],
  teamMode: 'solo',
  professionals: [
    { name: 'Ana', role: 'Esteticista', audience: 'all', serviceNames: ['Limpeza de pele'] },
  ],
  businessHours: [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({
    weekday,
    enabled: weekday >= 1 && weekday <= 5,
    start: '09:00',
    end: '18:00',
  })),
    uiFocus: 'address',
    preferences: {
      cancellationHours: 12,
      specialCancellationHours: 24,
      acceptInApp: false,
      packagePaymentMode: 'clinic_only',
    },
  }
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
  const a = (
    await connection.query('SELECT * FROM luminix.resolve_staff_identity($1)', ['onboarding-a'])
  ).rows[0].identity_id
  const b = (
    await connection.query('SELECT * FROM luminix.resolve_staff_identity($1)', ['onboarding-b'])
  ).rows[0].identity_id
  clinicA = String(
    (
      await connection.query('SELECT * FROM luminix.bootstrap_owner_clinic($1, $2)', [
        a,
        'Clínica A',
      ])
    ).rows[0].clinic_id,
  )
  clinicB = String(
    (
      await connection.query('SELECT * FROM luminix.bootstrap_owner_clinic($1, $2)', [
        b,
        'Clínica B',
      ])
    ).rows[0].clinic_id,
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
const call = (
  uid: string,
  method: 'GET' | 'PUT' | 'POST',
  clinic: string,
  suffix: string,
  body?: object,
) =>
  app.inject({
    method,
    url: `/clinics/${clinic}/${suffix}`,
    headers: { authorization: `Bearer ${uid}`, 'content-type': 'application/json' },
    payload: body ? JSON.stringify(body) : undefined,
  })

describe('versioned clinic onboarding', () => {
  it('isolates drafts, rejects stale writes, and completes once with real records', async () => {
    const initial = await call('onboarding-a', 'GET', clinicA, 'onboarding')
    expect(initial.statusCode).toBe(200)
    expect(initial.json().draft.step).toBe('contact')
    expect(initial.json().draft.payload.phone).toBe('')
    expect(initial.json().draft.payload.email).toBe('')
    expect(
      (
        await call('onboarding-a', 'PUT', clinicA, 'onboarding', {
          version: 0,
          step: 'contact',
          payload: { ...payload, ownerName: '', email: '', phone: '' },
        })
      ).statusCode,
    ).toBe(200)
    expect(
      (await call('onboarding-a', 'POST', clinicA, 'onboarding/complete', { version: 1 }))
        .statusCode,
    ).toBe(400)
    const savedContact = await call('onboarding-a', 'PUT', clinicA, 'onboarding', {
      version: 1,
      step: 'contact',
      payload: {
        ...payload,
        name: 'Clínica A',
        occupations: [],
        professionals: [],
      },
    })
    expect(savedContact.statusCode).toBe(200)
    expect(savedContact.json().draft.payload.phone).toBe('+5511999990001')
    expect((await call('onboarding-b', 'GET', clinicA, 'onboarding')).statusCode).toBe(403)
    const saved = await call('onboarding-a', 'PUT', clinicA, 'onboarding', {
      version: 2,
      step: 'review',
      payload,
    })
    expect(saved.statusCode).toBe(200)
    expect(saved.json().draft.version).toBe(3)
    expect(
      (
        await call('onboarding-a', 'PUT', clinicA, 'onboarding', {
          version: 0,
          step: 'review',
          payload,
        })
      ).statusCode,
    ).toBe(409)
    expect(
      (
        await call('onboarding-a', 'PUT', clinicA, 'onboarding', {
          version: 3,
          step: 'review',
          payload,
        })
      ).json().draft.version,
    ).toBe(4)
    expect(
      (await call('onboarding-a', 'POST', clinicA, 'onboarding/complete', { version: 3 }))
        .statusCode,
    ).toBe(409)
    const completed = await call('onboarding-a', 'POST', clinicA, 'onboarding/complete', {
      version: 4,
    })
    expect(completed.statusCode).toBe(200)
    expect(completed.json().replayed).toBe(false)
    expect(completed.json().clinic.shareCode).toMatch(/^LX-[A-F0-9]{12}$/)
    const replay = await call('onboarding-a', 'POST', clinicA, 'onboarding/complete', {
      version: 4,
    })
    expect(replay.statusCode).toBe(200)
    expect(replay.json().replayed).toBe(true)
    const overview = (await call('onboarding-a', 'GET', clinicA, 'overview')).json()
    expect(overview.occupations).toHaveLength(1)
    expect(overview.services).toHaveLength(1)
    expect(overview.professionals).toHaveLength(1)
    await db.query("SELECT set_config('luminix.clinic_id', $1, false)", [clinicA])
    expect(
      (await db.query('SELECT * FROM luminix.clinic_profiles WHERE clinic_id = $1', [clinicA]))
        .rows,
    ).toHaveLength(1)
    expect(
      (await db.query('SELECT * FROM luminix.business_hours WHERE clinic_id = $1', [clinicA])).rows,
    ).toHaveLength(5)
    expect(
      (await db.query('SELECT * FROM luminix.booking_policies WHERE clinic_id = $1', [clinicA]))
        .rows,
    ).toHaveLength(1)
    await db.query("SELECT set_config('luminix.clinic_id', '', false)")
    const other = (await call('onboarding-b', 'GET', clinicB, 'overview')).json()
    expect(other.services).toHaveLength(0)
    expect(
      (
        await call('onboarding-a', 'PUT', clinicA, 'onboarding', {
          version: 4,
          step: 'review',
          payload,
        })
      ).statusCode,
    ).toBe(409)
  })
})
