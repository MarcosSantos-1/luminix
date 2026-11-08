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
    await connection.query("UPDATE luminix.clinics SET status = 'active' WHERE id = $1", [id])
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
