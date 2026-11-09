import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { applyMigrations, type SqlConnection } from '../src/shared/database/migrations.js'

let db: PGlite
let connection: SqlConnection
let app: Awaited<ReturnType<typeof buildApp>>
const clinics = new Map<string, { id: string; code: string; service: string }>()

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
  for (const [label, name] of [
    ['a', 'Studio Lumière'],
    ['b', 'Studio Lumière'],
    ['draft', 'Rascunho'],
  ] as const) {
    const identity = (
      await connection.query('SELECT * FROM luminix.resolve_staff_identity($1)', [`owner-${label}`])
    ).rows[0].identity_id
    const clinic = (
      await connection.query('SELECT * FROM luminix.bootstrap_owner_clinic($1::uuid, $2)', [
        identity,
        name,
      ])
    ).rows[0]
    const id = String(clinic.clinic_id)
    await connection.query("SELECT set_config('luminix.clinic_id', $1, false)", [id])
    await connection.query(
      `INSERT INTO luminix.clinic_profiles (clinic_id, owner_name, contact_email, contact_phone, whatsapp_phone)
       VALUES ($1, 'Dona', 'dona@example.com', '+5511999999999', '+5511888888888')`,
      [id],
    )
    await connection.query(
      `INSERT INTO luminix.locations (clinic_id, name, address_line, city, state, is_primary)
       VALUES ($1, 'Principal', 'Rua A', 'São Paulo', 'SP', true)`,
      [id],
    )
    await connection.query('INSERT INTO luminix.booking_policies (clinic_id) VALUES ($1)', [id])
    const service = (
      await connection.query(
        `INSERT INTO luminix.services (clinic_id, name, category, price_cents, duration_minutes)
         VALUES ($1, 'Limpeza', 'Facial', 15000, 60) RETURNING id`,
        [id],
      )
    ).rows[0].id
    const code = String(
      (await connection.query('SELECT share_code FROM luminix.clinics WHERE id = $1', [id])).rows[0]
        .share_code,
    )
    if (label !== 'draft')
      await connection.query("UPDATE luminix.clinics SET status = 'active' WHERE id = $1", [id])
    clinics.set(label, { id, code, service: String(service) })
  }
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

const as = (label: string) => ({ authorization: `Bearer owner-${label}` })
const id = (label: string) => clinics.get(label)!.id
const profile = {
  name: 'Studio Lumière',
  ownerName: 'Dona Maria',
  email: 'maria@example.com',
  phone: '+5511977777777',
  whatsapp: '',
  foundedYear: '2010',
  instagram: '@lumiere',
  facebook: '',
  website: '',
  logoAssetId: '',
  addressLine: 'Rua Nova',
  addressNumber: '10',
  addressDistrict: 'Centro',
  addressNote: '',
  city: 'Campinas',
  state: 'SP',
  postalCode: '13010-000',
}
const rules = (services: { id: string }[]) => ({
  bookingNoticeHours: 2,
  bookingWindowDays: 60,
  cancellationHours: 24,
  specialCancellationHours: 48,
  reschedulingHours: null,
  clientInstructions: 'Chegue 10 minutos antes.',
  lateChangeRetentionPercent: 0,
  noShowRetentionPercent: 100,
  depositScope: 'selected',
  depositPercent: 30,
  depositThresholdCents: 30000,
  services: services.map(({ id }) => ({
    id,
    depositRequired: true,
    lateChangeRetentionPercent: null,
    noShowRetentionPercent: null,
  })),
})

describe('friendly public slugs', () => {
  it('derives unique slugs from the name on activation', async () => {
    const a = await app.inject({ method: 'GET', url: `/clinics/${id('a')}/slug`, headers: as('a') })
    const b = await app.inject({ method: 'GET', url: `/clinics/${id('b')}/slug`, headers: as('b') })
    expect(a.json().slug).toBe('studio-lumiere')
    expect(b.json().slug).toBe('studio-lumiere-2')
  })

  it('reports taken, reserved and invalid candidates and suggests alternatives', async () => {
    const check = async (value: string) =>
      (
        await app.inject({
          method: 'GET',
          url: `/clinics/${id('b')}/slug?check=${value}`,
          headers: as('b'),
        })
      ).json()
    expect((await check('studio-lumiere')).check).toMatchObject({
      available: false,
      problem: 'taken',
    })
    expect((await check('studio-lumiere')).suggestion).toMatch(/^studio-lumiere-/)
    expect((await check('demonstracao-unhas')).check.problem).toBe('reserved')
    expect((await check('ab-1234')).check.problem).toBe('reserved')
    expect((await check('x')).check.problem).toBe('invalid')
    expect((await check('lumiere-campinas')).check).toMatchObject({
      available: true,
      problem: null,
    })
  })

  it('changes the slug, keeps the old one for redirects and blocks other clinics from it', async () => {
    const change = (label: string, slug: string) =>
      app.inject({
        method: 'PUT',
        url: `/clinics/${id(label)}/slug`,
        headers: as(label),
        payload: { slug },
      })
    expect((await change('b', 'studio-lumiere')).statusCode).toBe(409)
    expect((await change('a', 'lumiere-campinas')).json()).toMatchObject({
      slug: 'lumiere-campinas',
      previous: 'studio-lumiere',
    })
    expect((await change('b', 'studio-lumiere')).statusCode).toBe(409)
    expect((await change('b', 'Lumiere')).statusCode).toBe(400)
    expect((await change('draft', 'rascunho-novo')).statusCode).toBe(400)

    await app.inject({
      method: 'PUT',
      url: `/clinics/${id('a')}/publication`,
      headers: as('a'),
      payload: { enabled: true, address: false, contacts: false },
    })
    const old = await app.inject({ method: 'GET', url: '/public/clinics/studio-lumiere' })
    expect(old.json()).toEqual({ redirectTo: 'lumiere-campinas' })
    const code = await app.inject({
      method: 'GET',
      url: `/public/clinics/${clinics.get('a')!.code.toLowerCase()}`,
    })
    expect(code.json()).toEqual({ redirectTo: 'lumiere-campinas' })
    const current = await app.inject({ method: 'GET', url: '/public/clinics/lumiere-campinas' })
    expect(current.json().clinic).toMatchObject({
      slug: 'lumiere-campinas',
      code: clinics.get('a')!.code,
    })
    // A clinic may take back its own previous slug.
    expect((await change('a', 'studio-lumiere')).statusCode).toBe(200)
    expect((await change('a', 'lumiere-campinas')).statusCode).toBe(200)
  })

  it('rejects other tenants', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/clinics/${id('a')}/slug`,
      headers: as('b'),
      payload: { slug: 'tomada' },
    })
    expect(response.statusCode).toBe(403)
  })
})

describe('profile editing', () => {
  it('updates name, contacts and address and reflects them publicly', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/clinics/${id('a')}/profile`,
      headers: as('a'),
      payload: { ...profile, name: 'Lumière Studio' },
    })
    expect(response.statusCode).toBe(200)
    const read = await app.inject({
      method: 'GET',
      url: `/clinics/${id('a')}/profile`,
      headers: as('a'),
    })
    expect(read.json().profile).toMatchObject({
      name: 'Lumière Studio',
      ownerName: 'Dona Maria',
      city: 'Campinas',
      postalCode: '13010000',
      foundedYear: '2010',
    })
    // Slug stays stable when the name changes.
    expect(read.json().clinic.slug).toBe('lumiere-campinas')
  })

  it('validates input, foreign logos and tenant isolation', async () => {
    const put = (label: string, target: string, body: Record<string, string>) =>
      app.inject({
        method: 'PUT',
        url: `/clinics/${id(target)}/profile`,
        headers: as(label),
        payload: body,
      })
    expect((await put('a', 'a', { ...profile, email: 'sem-arroba' })).statusCode).toBe(400)
    expect((await put('a', 'a', { ...profile, phone: '11999' })).statusCode).toBe(400)
    expect(
      (await put('a', 'a', { ...profile, logoAssetId: '00000000-0000-4000-8000-000000000000' }))
        .statusCode,
    ).toBe(400)
    expect((await put('b', 'a', profile)).statusCode).toBe(403)
    expect((await put('draft', 'draft', profile)).statusCode).toBe(400)
  })
})

describe('booking rules editing', () => {
  it('saves rules and per-service deposits of the same clinic only', async () => {
    const service = { id: clinics.get('a')!.service }
    const response = await app.inject({
      method: 'PUT',
      url: `/clinics/${id('a')}/booking-rules`,
      headers: as('a'),
      payload: rules([service]),
    })
    expect(response.statusCode).toBe(200)
    const read = (
      await app.inject({
        method: 'GET',
        url: `/clinics/${id('a')}/booking-rules`,
        headers: as('a'),
      })
    ).json()
    expect(read.rules).toMatchObject({
      bookingNoticeHours: 2,
      bookingWindowDays: 60,
      cancellationHours: 24,
      reschedulingHours: null,
      noShowRetentionPercent: 100,
      depositScope: 'selected',
      depositPercent: 30,
    })
    expect(read.services[0]).toMatchObject({ id: service.id, depositRequired: true })

    const foreign = await app.inject({
      method: 'PUT',
      url: `/clinics/${id('a')}/booking-rules`,
      headers: as('a'),
      payload: rules([{ id: clinics.get('b')!.service }]),
    })
    expect(foreign.statusCode).toBe(400)
    const invalid = await app.inject({
      method: 'PUT',
      url: `/clinics/${id('a')}/booking-rules`,
      headers: as('a'),
      payload: { ...rules([]), bookingWindowDays: 2 },
    })
    expect(invalid.statusCode).toBe(400)
  })
})

describe('showcase preview and visibility', () => {
  it('previews private data only for the clinic and hides optional public blocks', async () => {
    const preview = await app.inject({
      method: 'GET',
      url: `/clinics/${id('b')}/showcase/preview`,
      headers: as('b'),
    })
    expect(preview.statusCode).toBe(200)
    expect(preview.json().clinic.location).toMatchObject({ city: 'São Paulo' })
    expect(preview.json().publication.enabled).toBe(false)
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/clinics/${id('b')}/showcase/preview`,
          headers: as('a'),
        })
      ).statusCode,
    ).toBe(403)
    expect(
      (await app.inject({ method: 'GET', url: '/public/clinics/studio-lumiere-2' })).statusCode,
    ).toBe(404)

    const save = await app.inject({
      method: 'PUT',
      url: `/clinics/${id('a')}/showcase`,
      headers: as('a'),
      payload: {
        style: 'classic',
        subtitle: '',
        featured: [],
        gallery: [],
        hidden: ['foundedYear', 'hours'],
      },
    })
    expect(save.statusCode).toBe(200)
    const page = (
      await app.inject({ method: 'GET', url: '/public/clinics/lumiere-campinas' })
    ).json()
    expect(page.clinic).toMatchObject({
      foundedYear: null,
      hours: [],
      hidden: ['foundedYear', 'hours'],
    })
    const bad = await app.inject({
      method: 'PUT',
      url: `/clinics/${id('a')}/showcase`,
      headers: as('a'),
      payload: { style: 'classic', subtitle: '', featured: [], gallery: [], hidden: ['services'] },
    })
    expect(bad.statusCode).toBe(400)
  })
})
