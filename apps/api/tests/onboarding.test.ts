import { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ConnectProvider, ConnectStatus } from '../src/modules/payments/stripe-connect.js'
import { buildApp } from '../src/app.js'
import { applyMigrations, type SqlConnection } from '../src/shared/database/migrations.js'

let db: PGlite
let connection: SqlConnection
let app: Awaited<ReturnType<typeof buildApp>>
let clinicA: string
let clinicB: string
const serviceA = '11111111-1111-4111-8111-111111111111'
const serviceB = '22222222-2222-4222-8222-222222222222'
const professionalA = '33333333-3333-4333-8333-333333333333'
const readyStatus: ConnectStatus = {
  state: 'active',
  chargesEnabled: true,
  payoutsEnabled: true,
  requirementsDue: 0,
  testMode: true,
}
const connectStatus = vi.fn(async (): Promise<ConnectStatus> => ({ ...readyStatus }))
const connectContext = vi.fn(async () => ({
  platformAccountId: 'acct_platformOnboarding',
  livemode: false,
  publishableKey: 'pk_test_fixture',
}))
const connectProvider: ConnectProvider = {
  context: connectContext,
  status: connectStatus,
  create: async () => 'acct_onboardingB',
  session: async () => 'test_secret',
}
const payload = {
  name: 'Clínica A final',
  ownerName: 'Ana Souza',
  email: 'ana.a@example.com',
  phone: '+5511999990001',
  clinic: {
    theme: 'violeta',
    foundedYear: '2020',
    whatsapp: '+5511999990001',
    instagram: '@clinicaa',
    facebook: '',
    website: '',
    taxId: '04.252.011/0001-10',
    taxIdKind: 'cnpj',
    defaultAudience: 'all',
    addressLine: 'Rua A',
    addressNumber: '10',
    addressDistrict: 'Sé',
    addressNote: 'Sala 2',
    city: 'São Paulo',
    state: 'SP',
    postalCode: '01001000',
  },
  occupations: ['Estética facial'],
  services: [
    {
      id: serviceA,
      category: 'Estética facial',
      name: 'Limpeza facial premium',
      description: 'Limpeza completa',
      priceCents: 9000,
      durationMinutes: 60,
      priceType: 'fixed',
      bookingMode: 'instant',
      audience: 'all',
      resourceName: '',
      cancellationHours: null,
    },
    {
      id: serviceB,
      category: 'Depilação',
      name: 'Depilação com cera: íntima completa',
      description: 'Depilação íntima conforme cobertura definida pela clínica.',
      priceCents: 8500,
      durationMinutes: 60,
      priceType: 'fixed',
      bookingMode: 'instant',
      audience: 'women',
      sensitive: true,
      resourceName: '',
      cancellationHours: null,
    },
  ],
  teamMode: 'solo',
  professionals: [
    {
      id: professionalA,
      name: 'Ana Renomeada',
      role: 'Esteticista',
      gender: 'female',
      audience: 'all',
      serviceNames: ['Limpeza de pele', 'Depilação com cera: íntima completa'],
      serviceIds: [serviceA, serviceB],
      serviceAudiences: { [serviceB]: 'men' },
    },
  ],
  businessHours: [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({
    weekday,
    enabled: weekday >= 1 && weekday <= 5,
    start: '09:00',
    end: '18:00',
    breaks: weekday === 1 ? [{ start: '13:00', end: '14:00' }] : [],
  })),
  professionalSchedules: [
    {
      professionalId: professionalA,
      name: 'Ana',
      days: [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({
        weekday,
        enabled: weekday >= 1 && weekday <= 5,
        start: '09:00',
        end: '18:00',
        breaks: weekday === 1 ? [{ start: '13:00', end: '14:00' }] : [],
      })),
    },
  ],
  uiFocus: 'address',
  preferences: {
    bookingNoticeHours: 4,
    bookingWindowDays: 90,
    reschedulingHours: null,
    clientInstructions: 'Chegue 10 minutos antes. 💜',
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
      connectProvider,
      tenantPool: { connect: async () => ({ ...connection, release: () => {} }) },
      verifyToken: async (token) => ({ uid: token }),
    },
  )
})
afterEach(() => vi.restoreAllMocks())

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
  it('rejects invalid booking rules without saving them', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() - 61_000)
    for (const patch of [
      { bookingNoticeHours: -1 },
      { bookingNoticeHours: 169 },
      { bookingWindowDays: 0 },
      { bookingWindowDays: 366 },
      { reschedulingHours: 337 },
      { reschedulingHours: 1.5 },
      { clientInstructions: 'a'.repeat(501) },
      { lateChangeRetentionPercent: -1 },
      { lateChangeRetentionPercent: 101 },
      { noShowRetentionPercent: 25.5 },
      { noShowRetentionPercent: null },
    ]) {
      const result = await call('onboarding-a', 'PUT', clinicA, 'onboarding', {
        version: 0,
        step: 'rules',
        payload: { ...payload, preferences: { ...payload.preferences, ...patch } },
      })
      expect(result.statusCode).toBe(400)
    }
    expect((await call('onboarding-a', 'GET', clinicA, 'onboarding')).json().draft.version).toBe(0)
  })

  it('rejects invalid service retention before saving or authorizing another clinic', async () => {
    for (const patch of [
      { lateChangeRetentionPercent: -1 },
      { noShowRetentionPercent: 101 },
      { lateChangeRetentionPercent: 2.5 },
    ]) {
      const result = await call('onboarding-a', 'PUT', clinicA, 'onboarding', {
        version: 0,
        step: 'rules',
        payload: {
          ...payload,
          services: payload.services.map((service) => ({ ...service, ...patch })),
        },
      })
      expect(result.statusCode).toBe(400)
    }
    expect(
      (
        await call('onboarding-a', 'PUT', clinicB, 'onboarding', {
          version: 0,
          step: 'rules',
          payload,
        })
      ).statusCode,
    ).toBe(403)
    expect((await call('onboarding-a', 'GET', clinicA, 'onboarding')).json().draft.version).toBe(0)
  })

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
    expect((await call('onboarding-a', 'GET', clinicA, 'context')).json().clinic.theme).toBe(
      'violeta',
    )
    expect((await call('onboarding-b', 'GET', clinicA, 'onboarding')).statusCode).toBe(403)
    const outsideClinicHours = {
      ...payload,
      professionalSchedules: payload.professionalSchedules.map((schedule) => ({
        ...schedule,
        days: schedule.days.map((day) => (day.weekday === 1 ? { ...day, start: '08:00' } : day)),
      })),
    }
    expect(
      (
        await call('onboarding-a', 'PUT', clinicA, 'onboarding', {
          version: 2,
          step: 'review',
          payload: outsideClinicHours,
        })
      ).statusCode,
    ).toBe(200)
    const saved = await call('onboarding-a', 'PUT', clinicA, 'onboarding', {
      version: 3,
      step: 'review',
      payload,
    })
    expect(saved.statusCode).toBe(200)
    expect(saved.json().draft.version).toBe(4)
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
          version: 4,
          step: 'review',
          payload,
        })
      ).json().draft.version,
    ).toBe(5)
    expect(
      (await call('onboarding-a', 'POST', clinicA, 'onboarding/complete', { version: 4 }))
        .statusCode,
    ).toBe(409)
    const completed = await call('onboarding-a', 'POST', clinicA, 'onboarding/complete', {
      version: 5,
    })
    expect(completed.statusCode).toBe(200)
    expect(completed.json().replayed).toBe(false)
    expect(completed.json().clinic.shareCode).toMatch(/^(?!CU|KU|FU|SH)[A-Z]{2}-[0-9]{4}$/)
    const replay = await call('onboarding-a', 'POST', clinicA, 'onboarding/complete', {
      version: 4,
    })
    expect(replay.json().replayed).toBe(true)
    expect(replay.json().clinic.shareCode).toBe(completed.json().clinic.shareCode)
    const settings = (await call('onboarding-a', 'GET', clinicA, 'settings')).json()
    expect(settings.bookingRules).toEqual({
      bookingNoticeHours: 4,
      bookingWindowDays: 90,
      cancellationHours: 12,
      specialCancellationHours: 24,
      reschedulingHours: null,
      clientInstructions: 'Chegue 10 minutos antes. 💜',
      lateChangeRetentionPercent: 0,
      noShowRetentionPercent: 0,
      serviceRetentionOverrides: [],
    })
    expect((await call('onboarding-b', 'GET', clinicA, 'settings')).statusCode).toBe(403)
    expect((await call('onboarding-b', 'GET', clinicB, 'settings')).json().bookingRules).toBeNull()
    const overview = (await call('onboarding-a', 'GET', clinicA, 'overview')).json()
    expect(overview.occupations).toHaveLength(1)
    expect(overview.services).toHaveLength(2)
    expect(overview.professionals).toHaveLength(1)
    await db.query("SELECT set_config('luminix.clinic_id', $1, false)", [clinicA])
    expect(
      (
        await db.query('SELECT clinic_id FROM luminix.booking_policies WHERE clinic_id = $1', [
          clinicB,
        ])
      ).rows,
    ).toHaveLength(0)
    const profile = (
      await db.query(
        'SELECT tax_id_kind, default_audience, home_service, team_mode FROM luminix.clinic_profiles WHERE clinic_id = $1',
        [clinicA],
      )
    ).rows
    expect(profile).toEqual([
      { tax_id_kind: 'cnpj', default_audience: 'all', home_service: false, team_mode: 'solo' },
    ])
    expect(
      (
        await db.query(
          'SELECT address_number, district, address_note FROM luminix.locations WHERE clinic_id = $1',
          [clinicA],
        )
      ).rows,
    ).toEqual([{ address_number: '10', district: 'Sé', address_note: 'Sala 2' }])
    expect(
      (
        await db.query(
          'SELECT id, is_sensitive FROM luminix.services WHERE clinic_id = $1 ORDER BY id',
          [clinicA],
        )
      ).rows,
    ).toEqual([
      { id: serviceA, is_sensitive: false },
      { id: serviceB, is_sensitive: true },
    ])
    expect(
      (
        await db.query(
          'SELECT id, display_name, gender FROM luminix.professionals WHERE clinic_id = $1',
          [clinicA],
        )
      ).rows,
    ).toEqual([{ id: professionalA, display_name: 'Ana Renomeada', gender: 'female' }])
    const archived = (
      await db.query(
        `SELECT status, step, payload->>'name' AS name, payload->>'teamMode' AS team_mode
           FROM luminix.onboarding_drafts WHERE clinic_id = $1`,
        [clinicA],
      )
    ).rows
    expect(archived).toEqual([
      { status: 'completed', step: 'review', name: 'Clínica A final', team_mode: 'solo' },
    ])
    const mondaySchedule = (
      await db.query(
        `SELECT day_schedule->>'start' AS start, day_schedule->>'end' AS "end"
           FROM luminix.weekly_availability WHERE clinic_id = $1 AND weekday = 1`,
        [clinicA],
      )
    ).rows
    expect(mondaySchedule).toEqual([{ start: '09:00', end: '18:00' }])
    expect(
      (await db.query('SELECT * FROM luminix.business_hours WHERE clinic_id = $1', [clinicA])).rows,
    ).toHaveLength(5)
    const monday = (
      await db.query<{ periods: string | { start: string; end: string }[] }>(
        'SELECT periods FROM luminix.weekly_availability WHERE clinic_id = $1 AND weekday = 1',
        [clinicA],
      )
    ).rows[0]
    const periods = typeof monday.periods === 'string' ? JSON.parse(monday.periods) : monday.periods
    expect(periods).toEqual([
      { start: '09:00', end: '13:00' },
      { start: '14:00', end: '18:00' },
    ])
    expect(
      (await db.query('SELECT * FROM luminix.booking_policies WHERE clinic_id = $1', [clinicA]))
        .rows,
    ).toHaveLength(1)
    expect(
      (
        await db.query(
          'SELECT * FROM luminix.professional_weekly_availability WHERE clinic_id = $1',
          [clinicA],
        )
      ).rows,
    ).toHaveLength(7)
    const links = (
      await db.query(
        `SELECT s.name, ps.audience
         FROM luminix.professional_services ps
         JOIN luminix.services s ON s.clinic_id = ps.clinic_id AND s.id = ps.service_id
         WHERE ps.clinic_id = $1
         ORDER BY s.name`,
        [clinicA],
      )
    ).rows
    expect(links).toEqual([
      { name: 'Depilação com cera: íntima completa', audience: 'men' },
      { name: 'Limpeza facial premium', audience: null },
    ])
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

describe('space theme', () => {
  it('preserves the theme on completion', async () => {
    expect((await call('onboarding-a', 'GET', clinicA, 'context')).json().clinic.theme).toBe(
      'violeta',
    )
  })
  it('persists an allowed theme and exposes it through authorized context', async () => {
    const result = await call('onboarding-a', 'PUT', clinicA, 'theme', { theme: 'grafite' })
    expect(result.statusCode).toBe(200)
    const context = await call('onboarding-a', 'GET', clinicA, 'context')
    expect(context.json().clinic.theme).toBe('grafite')
  })
  it('rejects invalid themes and cross-clinic writes', async () => {
    expect(
      (await call('onboarding-a', 'PUT', clinicA, 'theme', { theme: 'other' })).statusCode,
    ).toBe(400)
    expect(
      (await call('onboarding-b', 'PUT', clinicA, 'theme', { theme: 'azul' })).statusCode,
    ).toBe(403)
    expect((await call('onboarding-a', 'GET', clinicA, 'context')).json().clinic.theme).toBe(
      'grafite',
    )
    expect((await call('onboarding-b', 'GET', clinicB, 'context')).json().clinic.theme).toBe('rosa')
  })
})

it('synchronizes settings with open drafts and rejects stale versions', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000)
  const saved = await call('onboarding-b', 'PUT', clinicB, 'onboarding', {
    version: 0,
    step: 'contact',
    payload,
  })
  expect(saved.statusCode).toBe(200)
  expect(
    (await call('onboarding-b', 'PUT', clinicB, 'theme', { theme: 'esmeralda' })).statusCode,
  ).toBe(200)
  const draft = (await call('onboarding-b', 'GET', clinicB, 'onboarding')).json().draft
  expect(draft.payload.clinic.theme).toBe('esmeralda')
  expect(draft.version).toBe(2)
  expect(
    (
      await call('onboarding-b', 'PUT', clinicB, 'onboarding', {
        version: 1,
        step: 'contact',
        payload,
      })
    ).statusCode,
  ).toBe(409)
  const oldClient = structuredClone(payload)
  Reflect.deleteProperty(oldClient.clinic, 'theme')
  expect(
    (
      await call('onboarding-b', 'PUT', clinicB, 'onboarding', {
        version: 2,
        step: 'contact',
        payload: oldClient,
      })
    ).statusCode,
  ).toBe(200)
  expect((await call('onboarding-b', 'GET', clinicB, 'context')).json().clinic.theme).toBe(
    'esmeralda',
  )
})

it('requires current Stripe readiness for advancement and completion, with an outside-app alternative', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 122_000)
  const uniquePayload = JSON.parse(
    JSON.stringify(payload)
      .replaceAll(serviceA, '44444444-4444-4444-8444-444444444444')
      .replaceAll(serviceB, '55555555-5555-4555-8555-555555555555')
      .replaceAll(professionalA, '66666666-6666-4666-8666-666666666666'),
  ) as typeof payload
  const inside = {
    ...uniquePayload,
    services: uniquePayload.services.map((service, index) => ({
      ...service,
      lateChangeRetentionPercent: index === 0 ? 0 : null,
      noShowRetentionPercent: index === 1 ? 25 : null,
    })),
    uiFocus: 'payments',
    preferences: {
      ...payload.preferences,
      acceptInApp: true,
      lateChangeRetentionPercent: 25,
      noShowRetentionPercent: 50,
    },
  }
  let version = (await call('onboarding-b', 'GET', clinicB, 'onboarding')).json().draft.version
  const save = (step: string, value = inside) =>
    call('onboarding-b', 'PUT', clinicB, 'onboarding', { version, step, payload: value })
  expect((await save('payments')).statusCode).toBe(200)
  version++
  const resumed = (await call('onboarding-b', 'GET', clinicB, 'onboarding')).json().draft.payload
  expect(resumed.preferences.lateChangeRetentionPercent).toBe(25)
  expect(resumed.preferences.noShowRetentionPercent).toBe(50)
  expect(resumed.services[0].lateChangeRetentionPercent).toBe(0)
  expect(resumed.services[1].noShowRetentionPercent).toBe(25)
  expect((await save('rules')).json().error).toBe('Stripe onboarding incomplete')
  expect(
    (await call('onboarding-b', 'POST', clinicB, 'onboarding/complete', { version })).json().error,
  ).toBe('Stripe onboarding incomplete')
  const before = connectContext.mock.calls.length
  expect(
    (
      await call('onboarding-a', 'PUT', clinicB, 'onboarding', {
        version,
        step: 'review',
        payload: inside,
      })
    ).statusCode,
  ).toBe(403)
  expect(connectContext.mock.calls.length).toBe(before)
  expect(
    (
      await call('onboarding-b', 'POST', clinicB, 'payments/connect/session', {
        purpose: 'onboarding',
      })
    ).statusCode,
  ).toBe(200)
  for (const status of [
    { ...readyStatus, state: 'pending' as const },
    { ...readyStatus, chargesEnabled: false },
    { ...readyStatus, payoutsEnabled: false },
    { ...readyStatus, requirementsDue: 1 },
    {
      state: 'reviewing' as const,
      chargesEnabled: false,
      payoutsEnabled: false,
      requirementsDue: 0,
      testMode: false,
    },
  ]) {
    connectStatus.mockResolvedValueOnce(status)
    expect((await save('rules')).json().error).toBe('Stripe onboarding incomplete')
  }
  connectStatus.mockRejectedValueOnce(new Error('private Stripe secret'))
  const unavailable = await save('review')
  expect(unavailable.statusCode).toBe(503)
  expect(unavailable.json().error).toBe('Stripe verification unavailable')
  connectStatus.mockResolvedValueOnce({
    state: 'reviewing',
    chargesEnabled: false,
    payoutsEnabled: false,
    requirementsDue: 0,
    testMode: true,
  })
  expect((await save('rules')).statusCode).toBe(200)
  version++
  expect((await save('rules')).statusCode).toBe(200)
  version++
  connectStatus.mockResolvedValueOnce({ ...readyStatus, payoutsEnabled: false })
  expect(
    (await call('onboarding-b', 'POST', clinicB, 'onboarding/complete', { version })).statusCode,
  ).toBe(409)
  const calls = connectContext.mock.calls.length
  const outside = { ...inside, preferences: { ...inside.preferences, acceptInApp: false } }
  expect((await save('review', outside)).statusCode).toBe(200)
  expect(connectContext.mock.calls.length).toBe(calls)
  version++
  expect((await save('review')).statusCode).toBe(200)
  version++
  expect(
    (await call('onboarding-b', 'POST', clinicB, 'onboarding/complete', { version })).statusCode,
  ).toBe(200)
  const completedCalls = connectContext.mock.calls.length
  expect(
    (await call('onboarding-b', 'POST', clinicB, 'onboarding/complete', { version })).json()
      .replayed,
  ).toBe(true)
  expect(connectContext.mock.calls.length).toBe(completedCalls)
  const rules = (await call('onboarding-b', 'GET', clinicB, 'settings')).json().bookingRules
  expect(rules.lateChangeRetentionPercent).toBe(25)
  expect(rules.noShowRetentionPercent).toBe(50)
  expect(rules.serviceRetentionOverrides).toEqual([
    {
      serviceId: uniquePayload.services[1].id,
      name: uniquePayload.services[1].name,
      lateChangeRetentionPercent: null,
      noShowRetentionPercent: 25,
    },
    {
      serviceId: uniquePayload.services[0].id,
      name: uniquePayload.services[0].name,
      lateChangeRetentionPercent: 0,
      noShowRetentionPercent: null,
    },
  ])
  expect((await call('onboarding-a', 'GET', clinicB, 'settings')).statusCode).toBe(403)
  expect(
    (await call('onboarding-a', 'GET', clinicA, 'settings')).json().bookingRules
      .serviceRetentionOverrides,
  ).toEqual([])
})
