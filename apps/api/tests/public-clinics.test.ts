import { PGlite } from '@electric-sql/pglite'
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../src/app.js'
import { applyMigrations, type SqlConnection } from '../src/shared/database/migrations.js'

let db: PGlite
let connection: SqlConnection
let app: Awaited<ReturnType<typeof buildApp>>
let clinicA: string
let clinicB: string
let slugA: string
let slugB: string
const showcaseFixtures = new Map<string, { service: string; photo: string }>()

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
      await connection.query('SELECT * FROM luminix.resolve_staff_identity($1)', [
        `public-${label}`,
      ])
    ).rows[0].identity_id
    const clinic = (
      await connection.query('SELECT * FROM luminix.bootstrap_owner_clinic($1::uuid, $2)', [
        identity,
        `Public ${label}`,
      ])
    ).rows[0]
    const id = String(clinic.clinic_id)
    const slug = String(clinic.clinic_slug)
    if (label === 'a') {
      clinicA = id
      slugA = slug
    } else {
      clinicB = id
      slugB = slug
    }
    await connection.query("SELECT set_config('luminix.clinic_id', $1, false)", [id])
    await connection.query(
      `INSERT INTO luminix.clinic_profiles (clinic_id, owner_name, contact_email, contact_phone, whatsapp_phone, instagram, tax_id)
      VALUES ($1, 'PRIVATE OWNER', 'private@example.com', '+5511999999999', '+5511888888888', '@publicstudio', 'PRIVATE TAX')`,
      [id],
    )
    await connection.query(
      `INSERT INTO luminix.locations (clinic_id, name, address_line, city, state, is_primary) VALUES ($1, 'Local', 'Rua privada', 'São Paulo', 'SP', true)`,
      [id],
    )
    const service = (
      await connection.query(
        `INSERT INTO luminix.services (clinic_id, name, category, price_cents, duration_minutes)
       VALUES ($1, $2, 'Facial', 15000, 60) RETURNING id`,
        [id, `Service ${label}`],
      )
    ).rows[0].id
    const photo = (
      await connection.query(
        `INSERT INTO luminix.media_assets (clinic_id, kind, status, created_by_membership_id, small_object_key, large_object_key, ready_at)
       SELECT $1, 'public_photo', 'ready', m.id, $2, $3, now()
       FROM luminix.clinic_memberships m WHERE m.clinic_id = $1 RETURNING id`,
        [id, `test-${label}-small.webp`, `test-${label}-large.webp`],
      )
    ).rows[0].id
    showcaseFixtures.set(label, { service: String(service), photo: String(photo) })
    await connection.query("UPDATE luminix.clinics SET status = 'active' WHERE id = $1", [id])
    // Activation replaces the code-shaped slug with one derived from the name (migration 0024).
    const activeSlug = String(
      (await connection.query('SELECT slug FROM luminix.clinics WHERE id = $1', [id])).rows[0].slug,
    )
    if (label === 'a') slugA = activeSlug
    else slugB = activeSlug
    await connection.query(
      `INSERT INTO luminix.services (clinic_id, name, price_cents, duration_minutes, status) VALUES ($1, 'ARCHIVED', 100, 10, 'archived')`,
      [id],
    )
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
const publish = (id: string, uid: string, enabled = true, address = false, contacts = false) =>
  app.inject({
    method: 'PUT',
    url: `/clinics/${id}/publication`,
    headers: { authorization: `Bearer ${uid}` },
    payload: { enabled, address, contacts },
  })
const read = (slug: string) => app.inject({ method: 'GET', url: `/public/clinics/${slug}` })

describe('public clinic boundary', () => {
  it('publishes ordered showcase content and rejects cross-tenant references', async () => {
    const a = showcaseFixtures.get('a')!
    const b = showcaseFixtures.get('b')!
    const update = (
      featured: { serviceId: string; assetId?: string }[],
      gallery: string[] = [],
      servicePhotos?: { serviceId: string; assetId: string }[],
    ) =>
      app.inject({
        method: 'PUT',
        url: `/clinics/${clinicA}/showcase`,
        headers: { authorization: 'Bearer public-a' },
        payload: { style: 'hair-salon', subtitle: 'Estilo A', featured, gallery, servicePhotos },
      })
    expect((await update([{ serviceId: b.service }])).statusCode).toBe(400)
    expect((await update([{ serviceId: a.service, assetId: b.photo }])).statusCode).toBe(400)
    expect((await update([], [b.photo])).statusCode).toBe(400)
    expect((await update([], [], [{ serviceId: a.service, assetId: b.photo }])).statusCode).toBe(
      400,
    )
    expect((await update([], [], [{ serviceId: b.service, assetId: a.photo }])).statusCode).toBe(
      400,
    )
    expect((await update([{ serviceId: a.service, assetId: a.photo }], [a.photo])).statusCode).toBe(
      200,
    )
    expect((await read(slugA)).statusCode).toBe(404)
    expect((await publish(clinicA, 'public-a')).statusCode).toBe(200)
    vi.stubEnv('R2_PUBLIC_BASE_URL', 'https://media.example.com')
    try {
      const clinic = (await read(slugA)).json().clinic
      expect(clinic).toMatchObject({
        style: 'hair-salon',
        heroCategory: 'cabelo',
        subtitle: 'Estilo A',
        gallery: ['https://media.example.com/test-a-large.webp'],
        featured: [
          { serviceId: a.service, photoUrl: 'https://media.example.com/test-a-large.webp' },
        ],
      })
      expect(clinic).not.toHaveProperty('galleryKeys')
      expect((await update([], [], [{ serviceId: a.service, assetId: a.photo }])).statusCode).toBe(
        200,
      )
      // A save from an older editor cannot erase the independent service photo.
      expect((await update([])).statusCode).toBe(200)
      const withPhoto = (await read(slugA)).json().clinic
      expect(withPhoto).toMatchObject({
        featured: [],
        servicePhotos: [
          { serviceId: a.service, photoUrl: 'https://media.example.com/test-a-large.webp' },
        ],
      })
      expect((await update([], [], [])).statusCode).toBe(200)
      expect((await read(slugA)).json().clinic.servicePhotos).toEqual([])
    } finally {
      vi.unstubAllEnvs()
    }
    expect((await update([])).statusCode).toBe(200)
    expect((await publish(clinicA, 'public-a', false)).statusCode).toBe(200)
  })
  it('keeps every existing clinic private by default and requires authorization to publish', async () => {
    expect((await read(slugA)).statusCode).toBe(404)
    expect((await publish(clinicA, 'public-b')).statusCode).toBe(403)
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/clinics/${clinicA}/publication`,
          payload: { enabled: true, address: true, contacts: true },
        })
      ).statusCode,
    ).toBe(401)
  })
  it('publishes only an explicit projection and keeps B private, regardless of forged tenant headers', async () => {
    expect((await publish(clinicA, 'public-a')).statusCode).toBe(200)
    const result = await app.inject({
      url: `/public/clinics/${slugA}`,
      headers: { 'x-clinic-id': clinicB, authorization: 'Bearer public-b' },
    })
    expect(result.statusCode).toBe(200)
    expect(result.headers['cache-control']).toBe('no-store')
    const clinic = result.json().clinic
    expect(clinic.name).toBe('Public a')
    expect(clinic.location).toBeNull()
    expect(clinic.whatsapp).toBeNull()
    expect(clinic.instagram).toBeNull()
    expect(clinic.services.map((service: { name: string }) => service.name)).toEqual(['Service a'])
    for (const privateText of [
      'PRIVATE OWNER',
      'private@example.com',
      'PRIVATE TAX',
      'ARCHIVED',
      'Service b',
      clinicA,
      clinicB,
    ])
      expect(result.body).not.toContain(privateText)
    expect((await read(slugB)).statusCode).toBe(404)
  })
  it('honors address/contact opt-in, persisted theme and independent A/B pages', async () => {
    await publish(clinicA, 'public-a', true, true, true)
    await publish(clinicB, 'public-b')
    await app.inject({
      method: 'PUT',
      url: `/clinics/${clinicA}/theme`,
      headers: { authorization: 'Bearer public-a' },
      payload: { theme: 'esmeralda' },
    })
    const a = (await read(slugA)).json().clinic
    const b = (await read(slugB)).json().clinic
    expect(a.location.line).toBe('Rua privada')
    expect(a.whatsapp).toBe('+5511888888888')
    expect(a.instagram).toBe('@publicstudio')
    expect(a.theme).toBe('esmeralda')
    expect(b.theme).toBe('rosa')
    expect(b.location).toBeNull()
    expect(b.services[0].name).toBe('Service b')
  })
  it('withdraws immediately without falling back to a demo', async () => {
    expect((await publish(clinicA, 'public-a', false)).statusCode).toBe(200)
    expect((await read(slugA)).statusCode).toBe(404)
    expect((await read('unknown-clinic')).statusCode).toBe(404)
    expect((await read(slugB)).statusCode).toBe(200)
  })
  it('returns no public page for drafts or suspended clinics, even if publication was enabled', async () => {
    await db.exec('RESET ROLE')
    await connection.query("SELECT set_config('luminix.clinic_id', $1, false)", [clinicB])
    await connection.query("UPDATE luminix.clinics SET status = 'draft' WHERE id = $1", [clinicB])
    await db.exec('SET ROLE luminix_api')
    expect((await read(slugB)).statusCode).toBe(404)
    expect((await publish(clinicB, 'public-b')).statusCode).toBe(400)
    await db.exec('RESET ROLE')
    await connection.query("UPDATE luminix.clinics SET status = 'suspended' WHERE id = $1", [
      clinicB,
    ])
    await db.exec('SET ROLE luminix_api')
    expect((await read(slugB)).statusCode).toBe(404)
  })
  it('does not grant anonymous DB execution or runtime direct writes', async () => {
    const acl = await connection.query(
      "SELECT has_function_privilege('public', 'luminix.read_public_clinic(text)', 'EXECUTE') AS allowed",
    )
    expect(acl.rows[0].allowed).toBe(false)
    await expect(
      connection.query(
        'UPDATE luminix.clinic_profiles SET public_enabled = true WHERE clinic_id = $1',
        [clinicA],
      ),
    ).rejects.toMatchObject({ code: '42501' })
  })
  it('sanitizes database failures and rejects malformed slugs', async () => {
    expect((await read('UPPERCASE')).statusCode).toBe(400)
    const failing = await buildApp(
      {},
      {
        database: {
          query: async () => {
            throw new Error('secret SQL password')
          },
        },
        verifyToken: async (uid) => ({ uid }),
      },
    )
    const result = await failing.inject({ url: '/public/clinics/ab-1234' })
    expect(result.statusCode).toBe(503)
    expect(result.body).not.toContain('secret')
    await failing.close()
  })
})

it('chooses a stable cover from the winning service family', async () => {
  const scenarios = [
    { categories: { Cabelo: 4, Cílios: 1, 'Estética facial': 1 }, hero: 'cabelo' },
    {
      categories: { Cabelo: 2, 'Estética facial': 9, 'Estética corporal': 11 },
      hero: 'estetica-facial',
    },
    {
      categories: { 'Estética facial': 3, Biomedicina: 1, Depilação: 2 },
      hero: 'estetica-avancada',
    },
    { categories: { 'Estética corporal': 2 }, hero: 'estetica-corporal' },
    { categories: { Cabelo: 1 }, audience: 'men', hero: 'barbearia' },
    { categories: { Cabelo: 1 }, audience: 'all', serviceAudience: 'men', hero: 'cabelo' },
    { categories: { Depilação: 1, Cílios: 5, Sobrancelhas: 2 }, hero: 'depilacao' },
    { categories: { Cílios: 3, Sobrancelhas: 2 }, hero: 'sobrancelhas' },
    { categories: { Massoterapia: 1, Quiropraxia: 2 }, hero: 'massoterapia' },
    { categories: { Tatuagem: 2, Piercing: 2 }, hero: 'tatuagem' },
    { categories: { Tatuagem: 1, Piercing: 3 }, hero: 'piercing' },
    { categories: { Cabelo: 1, 'Estética facial': 1 }, hero: 'cabelo' },
  ]
  await db.exec('RESET ROLE; BEGIN')
  try {
    for (const [index, scenario] of scenarios.entries()) {
      const identity = (
        await db.query('SELECT * FROM luminix.resolve_staff_identity($1)', [`hero-${index}`])
      ).rows[0] as { identity_id: string }
      const clinic = (
        await db.query('SELECT * FROM luminix.bootstrap_owner_clinic($1, $2)', [
          identity.identity_id,
          'Vitrine de teste',
        ])
      ).rows[0] as { clinic_id: string }
      const id = clinic.clinic_id
      await db.query(
        `INSERT INTO luminix.clinic_profiles (clinic_id, owner_name, contact_email, contact_phone, default_audience)
         VALUES ($1, 'Owner', 'owner@example.com', '+5511999999999', $2)`,
        [id, scenario.audience ?? 'all'],
      )
      for (const [category, total] of Object.entries(scenario.categories)) {
        await db.query(
          `INSERT INTO luminix.services (clinic_id, name, category, price_cents, duration_minutes, audience)
           SELECT $1, $2 || ' ' || position, $2, 10000, 40, $4
           FROM generate_series(1, $3::integer) position`,
          [id, category, total, scenario.serviceAudience ?? scenario.audience ?? 'all'],
        )
      }
      await db.query("UPDATE luminix.clinics SET status = 'active' WHERE id = $1", [id])
      await db.query("UPDATE luminix.services SET status = 'archived' WHERE clinic_id = $1", [id])
      const profile = await db.query(
        'SELECT initial_public_hero AS hero FROM luminix.clinic_profiles WHERE clinic_id = $1',
        [id],
      )
      expect(profile.rows[0], JSON.stringify(scenario.categories)).toEqual({ hero: scenario.hero })
    }
  } finally {
    await db.exec('ROLLBACK; SET ROLE luminix_api')
  }
})

it('applies public overrides while preserving the stored suggestion and internal name', async () => {
  const update = (changes: Record<string, string>) =>
    app.inject({
      method: 'PUT',
      url: `/clinics/${clinicA}/showcase`,
      headers: { authorization: 'Bearer public-a' },
      payload: { style: 'standard', subtitle: 'Escolha A', featured: [], gallery: [], ...changes },
    })
  expect((await publish(clinicA, 'public-a')).statusCode).toBe(200)
  try {
    expect((await update({ heroCategory: '__proto__' })).statusCode).toBe(400)
    expect(
      (await update({ heroCategory: 'unhas', title: 'Título público', theme: 'azul' })).statusCode,
    ).toBe(200)
    expect((await update({})).statusCode).toBe(200)
    expect((await read(slugA)).json().clinic).toMatchObject({
      name: 'Título público',
      theme: 'azul',
      heroCategory: 'unhas',
      style: 'standard',
    })
    expect((await update({ title: '', theme: '', heroCategory: '' })).statusCode).toBe(200)
    expect((await read(slugA)).json().clinic).toMatchObject({
      name: 'Public a',
      heroCategory: 'estetica-facial',
    })
  } finally {
    await publish(clinicA, 'public-a', false)
  }
})

describe('public clinic search by name', () => {
  const search = (q: string, target = app) =>
    target.inject({ method: 'GET', url: `/public/clinic-search?q=${encodeURIComponent(q)}` })
  const names = async (q: string) =>
    ((await search(q)).json().clinics as { name: string }[]).map((clinic) => clinic.name)

  beforeAll(async () => {
    await db.exec('RESET ROLE')
    const create = async (
      uid: string,
      name: string,
      options: { published?: boolean; status?: string; title?: string; address?: boolean } = {},
    ) => {
      const identity = (
        await connection.query('SELECT * FROM luminix.resolve_staff_identity($1)', [uid])
      ).rows[0].identity_id
      const id = String(
        (
          await connection.query('SELECT * FROM luminix.bootstrap_owner_clinic($1::uuid, $2)', [
            identity,
            name,
          ])
        ).rows[0].clinic_id,
      )
      await connection.query("SELECT set_config('luminix.clinic_id', $1, false)", [id])
      await connection.query(
        `INSERT INTO luminix.clinic_profiles (clinic_id, owner_name, contact_email, contact_phone, public_enabled, public_address, public_showcase)
         VALUES ($1, 'SEARCH OWNER', 'search-private@example.com', '+5511977777777', $2, $3, $4::jsonb)`,
        [
          id,
          options.published ?? true,
          options.address ?? false,
          JSON.stringify(options.title ? { title: options.title } : {}),
        ],
      )
      await connection.query(
        `INSERT INTO luminix.locations (clinic_id, name, address_line, address_number, district, city, state, is_primary)
         VALUES ($1, 'Local', 'Rua da Busca', '10', 'Centro', 'Campinas', 'SP', true)`,
        [id],
      )
      await connection.query("UPDATE luminix.clinics SET status = 'active' WHERE id = $1", [id])
      if (options.status)
        await connection.query('UPDATE luminix.clinics SET status = $2 WHERE id = $1', [
          id,
          options.status,
        ])
    }
    try {
      for (let index = 1; index <= 10; index += 1)
        await create(`search-${index}`, `Studio Íris ${String(index).padStart(2, '0')}`)
      await create('search-hidden', 'Studio Íris Oculta', { published: false })
      await create('search-suspended', 'Studio Íris Suspensa', { status: 'suspended' })
      await create('search-title', 'Interno Zeta', { title: 'Ateliê Ômega & Cia' })
      await create('search-address', 'Recanto Jaçanã', { address: true })
    } finally {
      await db.exec('SET ROLE luminix_api')
    }
  })

  it('finds only published and active clinics, capped at 8, ignoring accents and case', async () => {
    const result = await search('íris')
    expect(result.statusCode).toBe(200)
    expect(result.headers['cache-control']).toBe('no-store')
    const found = await names('IRIS')
    expect(found).toHaveLength(8)
    expect(found).toEqual(
      Array.from({ length: 8 }, (_, index) => `Studio Íris ${String(index + 1).padStart(2, '0')}`),
    )
    expect(result.json().clinics.map((clinic: { name: string }) => clinic.name)).toEqual(found)
    for (const term of ['oculta', 'suspensa', 'Studio Íris Oculta', 'Studio Íris Suspensa'])
      expect(await names(term)).toEqual([])
    expect(await names('  StUdIo   iris 10 ')).toEqual(['Studio Íris 10'])
  })

  it('matches the public name only and returns just the picker fields', async () => {
    expect(await names('zeta')).toEqual([])
    expect(await names('atelie omega')).toEqual(['Ateliê Ômega & Cia'])
    const hidden = (await search('omega cia')).json().clinics[0]
    expect(Object.keys(hidden).sort()).toEqual([
      'address',
      'category',
      'city',
      'code',
      'district',
      'logoUrl',
      'name',
      'slug',
      'state',
      'theme',
    ])
    // Address stays private unless the clinic opted in to publish it.
    expect(hidden).toMatchObject({ address: null, city: null, district: null, state: null })
    const result = await search('jacana')
    expect(result.json().clinics).toEqual([
      expect.objectContaining({
        name: 'Recanto Jaçanã',
        slug: 'recanto-jacana',
        address: 'Rua da Busca, 10',
        district: 'Centro',
        city: 'Campinas',
        state: 'SP',
      }),
    ])
    for (const privateText of ['SEARCH OWNER', 'search-private@example.com', '+5511977777777'])
      expect(result.body).not.toContain(privateText)
    // The full space code finds its own clinic; a fragment of it does not enumerate codes.
    const code = String(result.json().clinics[0].code)
    expect(code).toMatch(/^[A-Z]{2}-[0-9]{4}$/)
    expect(await names(code.toLowerCase())).toEqual(['Recanto Jaçanã'])
    expect(await names(code.slice(3))).toEqual([])
  })

  it('refuses short or missing terms and treats wildcards as text', async () => {
    expect((await search('ir')).statusCode).toBe(400)
    expect((await app.inject({ url: '/public/clinic-search' })).statusCode).toBe(400)
    expect((await app.inject({ url: '/public/clinic-search?q=iris&limit=99' })).statusCode).toBe(
      400,
    )
    for (const term of ['%%%', '___', 'í-í', '   a   ', '% %'])
      expect(await names(term)).toEqual([])
    expect((await search('x'.repeat(121))).statusCode).toBe(400)
  })

  it('is not callable anonymously in the database and limits requests per IP', async () => {
    await db.exec('RESET ROLE')
    try {
      const acl = await connection.query(
        `SELECT has_function_privilege('public', 'luminix.search_public_clinics(text)', 'EXECUTE') AS search,
                has_function_privilege('luminix_api', 'luminix.search_public_clinics(text)', 'EXECUTE') AS runtime`,
      )
      expect(acl.rows[0]).toEqual({ search: false, runtime: true })
    } finally {
      await db.exec('SET ROLE luminix_api')
    }
    const fresh = await buildApp(
      {},
      { database: connection, verifyToken: async (uid: string) => ({ uid }) },
    )
    try {
      for (let attempt = 0; attempt < 60; attempt += 1)
        expect((await search('iris', fresh)).statusCode).toBe(200)
      const blocked = await search('iris', fresh)
      expect(blocked.statusCode).toBe(429)
      expect(blocked.headers['retry-after']).toBe('60')
      // The search budget is separate from the page budget.
      expect((await fresh.inject({ url: '/public/clinics/studio-iris-01' })).statusCode).toBe(200)
    } finally {
      await fresh.close()
    }
  })

  it('sanitizes database failures', async () => {
    const failing = await buildApp(
      {},
      {
        database: {
          query: async () => {
            throw new Error('secret SQL password')
          },
        },
        verifyToken: async (uid: string) => ({ uid }),
      },
    )
    const result = await failing.inject({ url: '/public/clinic-search?q=iris' })
    expect(result.statusCode).toBe(503)
    expect(result.body).not.toContain('secret')
    await failing.close()
  })
})
