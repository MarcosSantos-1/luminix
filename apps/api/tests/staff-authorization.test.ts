import { PGlite } from '@electric-sql/pglite'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { applyMigrations, type SqlConnection } from '../src/shared/database/migrations.js'
import { assertRuntimeDatabaseSecurity } from '../src/shared/database/runtime-security.js'

let db: PGlite
let database: SqlConnection
let app: Awaited<ReturnType<typeof buildApp>>
let a: string
let b: string
let ownerA: string
let dual: string
beforeAll(async () => {
  db = new PGlite()
  database = {
    async query(sql, values) {
      if (values) return db.query(sql, values)
      const results = await db.exec(sql)
      return { rows: results.at(-1)?.rows ?? [] }
    },
  }
  await applyMigrations(database)
  ownerA = String(
    (await database.query('SELECT * FROM luminix.resolve_staff_identity($1)', ['a'])).rows[0]
      .identity_id,
  )
  const ownerB = (await database.query('SELECT * FROM luminix.resolve_staff_identity($1)', ['b']))
    .rows[0].identity_id
  dual = String(
    (await database.query('SELECT * FROM luminix.resolve_staff_identity($1)', ['dual'])).rows[0]
      .identity_id,
  )
  a = String(
    (
      await database.query('SELECT * FROM luminix.bootstrap_owner_clinic($1, $2)', [
        ownerA,
        'Clínica A',
      ])
    ).rows[0].clinic_id,
  )
  b = String(
    (
      await database.query('SELECT * FROM luminix.bootstrap_owner_clinic($1, $2)', [
        ownerB,
        'Clínica B',
      ])
    ).rows[0].clinic_id,
  )
  const roleA = (await database.query('SELECT id FROM luminix.roles WHERE clinic_id = $1', [a]))
    .rows[0].id
  const roleB = (
    await database.query(
      "INSERT INTO luminix.roles(clinic_id, name) VALUES ($1, 'professional') RETURNING id",
      [b],
    )
  ).rows[0].id
  await database.query(
    "INSERT INTO luminix.role_permissions(clinic_id, role_id, permission_code) VALUES ($1, $2, 'service:manage')",
    [b, roleB],
  )
  await database.query(
    'INSERT INTO luminix.clinic_memberships(clinic_id, identity_id, role_id) VALUES ($1, $2, $3), ($4, $2, $5)',
    [a, dual, roleA, b, roleB],
  )
  await db.exec('SET ROLE luminix_api')
  app = await buildApp(
    {},
    {
      database,
      tenantPool: { connect: async () => ({ ...database, release: () => {} }) },
      verifyToken: async (token) => {
        if (['revoked', 'expired', 'wrong-project'].includes(token))
          throw new Error('Provider secret')
        return { uid: token === 'a-old' ? 'a' : token }
      },
    },
  )
})
afterAll(async () => {
  await app?.close()
  await db?.close()
})
const get = (uid: string, path: string, headers = {}) =>
  app.inject({ url: path, headers: { authorization: `Bearer ${uid}`, ...headers } })
async function asOwner(work: () => Promise<void>) {
  await db.exec('RESET ROLE')
  try {
    await work()
  } finally {
    await db.exec('SET ROLE luminix_api')
  }
}

describe('HTTP staff authorization using runtime role', () => {
  it('verifies runtime and rejects privileged role; globals and writes are not granted', async () => {
    await expect(assertRuntimeDatabaseSecurity(database)).resolves.toBeUndefined()
    for (const sql of [
      'SELECT * FROM luminix.identities',
      'SELECT * FROM luminix.client_profiles',
      'SELECT * FROM luminix.owner_clinic_bootstraps',
      'UPDATE luminix.role_permissions SET permission_code = permission_code',
      'DELETE FROM luminix.audit_logs',
      'CREATE SCHEMA forbidden',
      'CREATE TEMP TABLE forbidden(id integer)',
    ]) {
      await expect(database.query(sql)).rejects.toMatchObject({ code: '42501' })
    }
    await asOwner(async () => {
      await expect(assertRuntimeDatabaseSecurity(database)).rejects.toThrow('refusing privileged')
    })
  })
  it('discovers only own clinics and ignores forged identity/clinic/permission headers', async () => {
    const response = await get('a', '/auth/clinics', { 'x-identity-id': dual, 'x-clinic-id': b })
    expect(response.statusCode).toBe(200)
    expect(response.json().clinics).toEqual([
      { id: a, name: 'Clínica A', status: 'draft', role: 'owner' },
    ])
    expect(response.json().nextCursor).toBeNull()
    expect(response.headers['cache-control']).toBe('no-store')
    expect((await get('unknown', '/auth/clinics')).json().clinics).toEqual([])
    expect((await get('a', '/auth/clinics?after=invalid')).statusCode).toBe(400)
  })
  it('switches clinics with one existing token and enforces different permissions in each', async () => {
    expect(
      (await get('dual', '/auth/clinics'))
        .json()
        .clinics.map((c: { id: string }) => c.id)
        .sort(),
    ).toEqual([a, b].sort())
    const contextA = await get('dual', `/clinics/${a}/context`)
    const contextB = await get('dual', `/clinics/${b}/context`)
    expect(contextA.json().clinic.id).toBe(a)
    expect(contextA.json().permissions).toContain('settings:manage')
    expect(contextB.json().clinic.id).toBe(b)
    expect(contextB.json().permissions).toEqual(['service:manage'])
    expect((await get('dual', `/clinics/${a}/settings`)).json()).toEqual({
      settings: { timezone: 'America/Sao_Paulo', locale: 'pt-BR', currency: 'BRL' },
    })
    expect(
      (await get('dual', `/clinics/${b}/settings`, { 'x-permission': 'settings:manage' }))
        .statusCode,
    ).toBe(403)
    expect((await get('a', `/clinics/${b}/context`)).statusCode).toBe(403)
    expect((await get('b', `/clinics/${a}/settings`)).statusCode).toBe(403)
    expect(
      (await get('a', `/clinics/${a}/settings`, { 'x-clinic-id': b })).json().settings.currency,
    ).toBe('BRL')
    expect((await database.query('SELECT * FROM luminix.clinic_settings')).rows).toEqual([])
  })
  it('rejects invalid and revoked tokens without leaking provider/SQL details', async () => {
    for (const token of ['revoked', 'expired', 'wrong-project']) {
      const response = await get(token, `/clinics/${a}/settings`)
      expect(response.statusCode).toBe(401)
      expect(response.body).not.toMatch(/secret|SQL|Provider/)
    }
    expect((await app.inject({ url: `/clinics/${a}/context` })).statusCode).toBe(401)
  })
  it('removes access immediately for old still-valid token and preserves other memberships', async () => {
    expect((await get('a-old', `/clinics/${a}/context`)).statusCode).toBe(200)
    await asOwner(async () => {
      await database.query(
        "UPDATE luminix.clinic_memberships SET status = 'revoked' WHERE identity_id = $1 AND clinic_id = $2",
        [ownerA, a],
      )
    })
    expect((await get('a-old', `/clinics/${a}/context`)).statusCode).toBe(403)
    expect((await get('a-old', '/auth/clinics')).json().clinics).toEqual([])
    expect((await get('dual', `/clinics/${b}/context`)).statusCode).toBe(200)
    await asOwner(async () => {
      await database.query(
        "UPDATE luminix.clinic_memberships SET status = 'active' WHERE identity_id = $1 AND clinic_id = $2",
        [ownerA, a],
      )
    })
  })
  it('checks current grants, clinic suspension and identity disablement on every request', async () => {
    let role: unknown
    await asOwner(async () => {
      role = (
        await database.query(
          'SELECT role_id FROM luminix.clinic_memberships WHERE identity_id = $1 AND clinic_id = $2',
          [ownerA, a],
        )
      ).rows[0].role_id
      await database.query(
        "DELETE FROM luminix.role_permissions WHERE clinic_id = $1 AND role_id = $2 AND permission_code = 'settings:manage'",
        [a, role],
      )
    })
    expect((await get('a-old', `/clinics/${a}/settings`)).statusCode).toBe(403)
    expect((await get('a-old', `/clinics/${a}/context`)).json().permissions).not.toContain(
      'settings:manage',
    )
    await asOwner(async () => {
      await database.query("UPDATE luminix.clinics SET status = 'suspended' WHERE id = $1", [b])
    })
    expect((await get('b', `/clinics/${b}/context`)).statusCode).toBe(403)
    expect(
      (await get('dual', '/auth/clinics')).json().clinics.map((c: { id: string }) => c.id),
    ).toEqual([a])
    await asOwner(async () => {
      await database.query("UPDATE luminix.identities SET status = 'disabled' WHERE id = $1", [
        ownerA,
      ])
    })
    expect((await get('a-old', `/clinics/${a}/context`)).statusCode).toBe(403)
  })
  it('paginates own links without dropping or repeating clinics', async () => {
    await asOwner(async () => {
      const pager = (
        await database.query('SELECT * FROM luminix.resolve_staff_identity($1)', ['pager'])
      ).rows[0].identity_id
      await database.query(
        `WITH c AS (
        INSERT INTO luminix.clinics(name, slug) SELECT 'Paged clinic', 'paged-' || gen_random_uuid()::text FROM generate_series(1, 52) RETURNING id
      ), r AS (INSERT INTO luminix.roles(clinic_id, name) SELECT c.id, 'reader' FROM c RETURNING id, clinic_id)
      INSERT INTO luminix.clinic_memberships(clinic_id, role_id, identity_id) SELECT r.clinic_id, r.id, $1 FROM r`,
        [pager],
      )
    })
    const first = (await get('pager', '/auth/clinics')).json()
    expect(first.clinics).toHaveLength(50)
    const next = (await get('pager', `/auth/clinics?after=${first.nextCursor}`)).json()
    expect(next.clinics).toHaveLength(2)
    expect(next.nextCursor).toBeNull()
    expect(new Set([...first.clinics, ...next.clinics].map((c: { id: string }) => c.id)).size).toBe(
      52,
    )
  })
})
