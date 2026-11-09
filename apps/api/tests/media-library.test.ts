import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { applyMigrations, type SqlConnection } from '../src/shared/database/migrations.js'

let db: PGlite
let connection: SqlConnection
let app: Awaited<ReturnType<typeof buildApp>>
const clinics = new Map<string, string>()
const previousEnv = { ...process.env }

beforeAll(async () => {
  Object.assign(process.env, {
    R2_ACCESS_KEY_ID: 'test-key',
    R2_SECRET_ACCESS_KEY: 'test-secret',
    R2_BUCKET: 'luminix',
    R2_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
    R2_PUBLIC_BASE_URL: 'https://public.example.com',
  })
  delete process.env.R2_PRIVATE_BUCKET
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
      await connection.query('SELECT * FROM luminix.resolve_staff_identity($1)', [`owner-${label}`])
    ).rows[0].identity_id
    const id = String(
      (
        await connection.query('SELECT * FROM luminix.bootstrap_owner_clinic($1::uuid, $2)', [
          identity,
          `Espaço ${label}`,
        ])
      ).rows[0].clinic_id,
    )
    await connection.query("UPDATE luminix.clinics SET status = 'active' WHERE id = $1", [id])
    clinics.set(label, id)
  }
  // A reception login in clinic A.
  const reception = (
    await connection.query('SELECT * FROM luminix.resolve_staff_identity($1)', ['reception-a'])
  ).rows[0].identity_id
  await connection.query("SELECT set_config('luminix.clinic_id', $1, false)", [clinics.get('a')])
  await connection.query(
    `INSERT INTO luminix.clinic_memberships (clinic_id, identity_id, role_id)
     SELECT $1, $2, id FROM luminix.roles WHERE clinic_id = $1 AND name = 'reception'`,
    [clinics.get('a'), reception],
  )
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
  process.env = previousEnv
  await app?.close()
  await db?.close()
})

const as = (uid: string) => ({ authorization: `Bearer ${uid}` })
const url = (label: string, path: string) => `/clinics/${clinics.get(label)}/${path}`

/** Simulates a finished private upload (R2 itself is not reachable in tests). */
async function readyAsset(label: string, folder: string) {
  await db.exec('RESET ROLE')
  const clinic = clinics.get(label)!
  const asset = (
    await connection.query(
      `INSERT INTO luminix.media_assets (clinic_id, kind, subject_ref, status, created_by_membership_id,
         small_object_key, large_object_key, small_bytes, large_bytes, ready_at)
       SELECT $1::uuid, 'library_photo', $2::uuid, 'ready', m.id, $1::text || '/library/x/small-480.webp',
         $1::text || '/library/x/large-1600.webp', 40000, 300000, now()
       FROM luminix.clinic_memberships m WHERE m.clinic_id = $1::uuid LIMIT 1 RETURNING id`,
      [clinic, folder],
    )
  ).rows[0].id
  await db.exec('SET ROLE luminix_api')
  return String(asset)
}

describe('media library', () => {
  it('creates the default folders and reports private storage state', async () => {
    const response = await app.inject({ url: url('a', 'library'), headers: as('owner-a') })
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.folders.map((folder: { systemKey: string }) => folder.systemKey)).toEqual([
      'clients',
      'before_after',
      'marketing',
      'space',
      'team',
    ])
    expect(body).toMatchObject({ storageReady: false, canManage: true, usage: { items: 0 } })
  })

  it('lets reception browse but not change; keeps clinics apart', async () => {
    const read = await app.inject({ url: url('a', 'library'), headers: as('reception-a') })
    expect(read.json().canManage).toBe(false)
    const create = await app.inject({
      method: 'POST',
      url: url('a', 'library/folders'),
      headers: as('reception-a'),
      payload: { name: 'Minha pasta' },
    })
    expect(create.statusCode).toBe(403)
    expect(
      (await app.inject({ url: url('a', 'library'), headers: as('owner-b') })).statusCode,
    ).toBe(403)
  })

  it('manages folders and refuses renaming system folders', async () => {
    const created = await app.inject({
      method: 'POST',
      url: url('a', 'library/folders'),
      headers: as('owner-a'),
      payload: { name: 'Noivas 2026' },
    })
    expect(created.statusCode).toBe(200)
    const duplicate = await app.inject({
      method: 'POST',
      url: url('a', 'library/folders'),
      headers: as('owner-a'),
      payload: { name: 'noivas 2026' },
    })
    expect(duplicate.statusCode).toBe(409)
    const folders = (await app.inject({ url: url('a', 'library'), headers: as('owner-a') })).json()
      .folders
    const marketing = folders.find(
      (folder: { systemKey: string }) => folder.systemKey === 'marketing',
    )
    const rename = await app.inject({
      method: 'PUT',
      url: url('a', `library/folders/${marketing.id}`),
      headers: as('owner-a'),
      payload: { name: 'Outro nome' },
    })
    expect(rename.statusCode).toBe(400)
  })

  it('stores items privately, signs read URLs and supports the trash', async () => {
    const folders = (await app.inject({ url: url('a', 'library'), headers: as('owner-a') })).json()
      .folders
    const target = folders.find(
      (folder: { systemKey: string }) => folder.systemKey === 'before_after',
    )
    const asset = await readyAsset('a', target.id)

    const add = await app.inject({
      method: 'POST',
      url: url('a', 'library/items'),
      headers: as('owner-a'),
      payload: { folderId: target.id, assetId: asset, title: 'Maria · antes' },
    })
    expect(add.statusCode).toBe(200)

    // Without a private bucket, no URL at all; never a public one.
    let items = (
      await app.inject({
        url: url('a', `library/items?folder=${target.id}`),
        headers: as('owner-a'),
      })
    ).json().items
    expect(items[0]).toMatchObject({ title: 'Maria · antes', thumbUrl: null, bytes: 340000 })

    process.env.R2_PRIVATE_BUCKET = 'luminix-private'
    items = (
      await app.inject({
        url: url('a', `library/items?folder=${target.id}`),
        headers: as('reception-a'),
      })
    ).json().items
    expect(items[0].thumbUrl).toContain('luminix-private')
    expect(items[0].thumbUrl).toContain('X-Amz-Signature')
    expect(items[0].thumbUrl).not.toContain('public.example.com')

    const trash = await app.inject({
      method: 'PUT',
      url: url('a', `library/items/${items[0].id}`),
      headers: as('owner-a'),
      payload: { status: 'trashed' },
    })
    expect(trash.statusCode).toBe(200)
    expect(
      (
        await app.inject({
          url: url('a', `library/items?folder=${target.id}`),
          headers: as('owner-a'),
        })
      ).json().items,
    ).toHaveLength(0)
    expect(
      (await app.inject({ url: url('a', 'library/items?trash=1'), headers: as('owner-a') })).json()
        .items,
    ).toHaveLength(1)
    const library = (await app.inject({ url: url('a', 'library'), headers: as('owner-a') })).json()
    expect(library.usage).toMatchObject({ libraryBytes: 340000, trashed: 1 })
    delete process.env.R2_PRIVATE_BUCKET
  })

  it('rejects assets from other clinics and library uploads without a folder', async () => {
    const folders = (await app.inject({ url: url('b', 'library'), headers: as('owner-b') })).json()
      .folders
    const otherAsset = await readyAsset('b', folders[0].id)
    const aFolders = (await app.inject({ url: url('a', 'library'), headers: as('owner-a') })).json()
      .folders
    const add = await app.inject({
      method: 'POST',
      url: url('a', 'library/items'),
      headers: as('owner-a'),
      payload: { folderId: aFolders[0].id, assetId: otherAsset },
    })
    expect(add.statusCode).toBe(400)
    const begin = await app.inject({
      method: 'POST',
      url: url('a', 'media'),
      headers: as('owner-a'),
      payload: { kind: 'library_photo', subjectRef: folders[0].id },
    })
    expect(begin.statusCode).toBe(400)
    const reception = await app.inject({
      method: 'POST',
      url: url('a', 'media'),
      headers: as('reception-a'),
      payload: { kind: 'library_photo', subjectRef: aFolders[0].id },
    })
    expect(reception.statusCode).toBe(403)
  })
})
