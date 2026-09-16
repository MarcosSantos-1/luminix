import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { applyMigrations, type SqlConnection } from '../src/shared/database/migrations.js'
import { withClinicTransaction } from '../src/shared/tenant/clinic-transaction.js'

let db: PGlite
let database: SqlConnection
let app: Awaited<ReturnType<typeof buildApp>>
let a: string
let b: string
let identityA: string
let identityB: string
const pool = { connect: async () => ({ ...database, release: () => {} }) }
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
  app = await buildApp(
    {},
    {
      database,
      verifyToken: async (token) => {
        if (token === 'revoked') throw new Error('revoked')
        return { uid: token }
      },
    },
  )
})
afterAll(async () => {
  await app?.close()
  await db?.close()
})
const create = (uid: string, body: object, headers = {}) =>
  app.inject({
    method: 'POST',
    url: '/auth/owner-clinic',
    payload: body,
    headers: { authorization: `Bearer ${uid}`, ...headers },
  })

describe('first owner clinic', () => {
  it('rejects missing auth, revoked token, blank name and arbitrary identity/role fields', async () => {
    expect(
      (await app.inject({ method: 'POST', url: '/auth/owner-clinic', payload: { name: 'A' } }))
        .statusCode,
    ).toBe(401)
    expect((await create('revoked', { name: 'A' })).statusCode).toBe(401)
    for (const body of [
      { name: '   ' },
      { name: 'A', identityId: 'other' },
      { name: 'A', role: 'owner' },
      { name: 'A', permissions: [] },
    ]) {
      const response = await create('a', body)
      expect(response.statusCode).toBe(400)
      expect(response.headers['cache-control']).toBe('no-store')
    }
    expect((await database.query('SELECT id FROM luminix.clinics')).rows).toHaveLength(0)
  })

  it('creates one draft with owner, grants, settings and audit even on concurrent retries', async () => {
    const responses = await Promise.all([
      create('a', { name: ' Clínica A ' }),
      create('a', { name: 'Clínica A' }),
    ])
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 201])
    a = responses[0].json().clinic.id
    expect(responses.every((r) => r.json().clinic.id === a)).toBe(true)
    expect(responses[0].json().clinic).toMatchObject({
      name: 'Clínica A',
      status: 'draft',
      slug: `clinica-${a}`,
    })
    const member = (
      await database.query('SELECT * FROM luminix.clinic_memberships WHERE clinic_id = $1', [a])
    ).rows[0]
    identityA = member.identity_id as string
    expect(member.status).toBe('active')
    expect(
      (await database.query('SELECT name FROM luminix.roles WHERE id = $1', [member.role_id]))
        .rows[0],
    ).toEqual({ name: 'owner' })
    expect(
      (
        await database.query(
          'SELECT permission_code FROM luminix.role_permissions WHERE clinic_id = $1',
          [a],
        )
      ).rows,
    ).toHaveLength(9)
    expect(
      (
        await database.query(
          'SELECT currency, locale, timezone FROM luminix.clinic_settings WHERE clinic_id = $1',
          [a],
        )
      ).rows[0],
    ).toEqual({ currency: 'BRL', locale: 'pt-BR', timezone: 'America/Sao_Paulo' })
    const audit = (
      await database.query(
        'SELECT actor_identity_id FROM luminix.audit_logs WHERE clinic_id = $1',
        [a],
      )
    ).rows
    expect(audit).toHaveLength(13)
    expect(audit.every((row) => row.actor_identity_id === identityA)).toBe(true)
    expect((await create('a', { name: 'Other name' })).statusCode).toBe(409)
    expect((await database.query('SELECT id FROM luminix.clinics')).rows).toHaveLength(1)
    expect(
      (
        await database.query(
          "SELECT nullif(current_setting('luminix.clinic_id', true), '') AS clinic",
        )
      ).rows[0].clinic,
    ).toBeNull()
  })

  it('keeps owner A and B isolated, ignoring forged headers, with restricted role', async () => {
    const response = await create(
      'b',
      { name: 'Clínica B' },
      { 'x-clinic-id': a, 'x-identity-id': identityA },
    )
    expect(response.statusCode).toBe(201)
    b = response.json().clinic.id
    expect(b).not.toBe(a)
    identityB = (
      await database.query(
        'SELECT identity_id FROM luminix.clinic_memberships WHERE clinic_id = $1',
        [b],
      )
    ).rows[0].identity_id as string
    await db.exec(`CREATE ROLE bootstrap_probe NOSUPERUSER NOBYPASSRLS;
      GRANT USAGE ON SCHEMA luminix TO bootstrap_probe;
      GRANT SELECT ON luminix.identities, luminix.clinics, luminix.roles, luminix.role_permissions, luminix.clinic_memberships, luminix.clinic_settings TO bootstrap_probe;
      GRANT UPDATE (id) ON luminix.clinics, luminix.roles, luminix.clinic_memberships TO bootstrap_probe;
      GRANT UPDATE (permission_code) ON luminix.role_permissions TO bootstrap_probe;
      GRANT EXECUTE ON FUNCTION luminix.authorize_staff_clinic(uuid, uuid, text) TO bootstrap_probe;
      SET ROLE bootstrap_probe;`)
    try {
      await expect(
        withClinicTransaction(pool, identityA, b, 'clinic:manage', async () => true),
      ).rejects.toMatchObject({ statusCode: 403 })
      await expect(
        withClinicTransaction(pool, identityB, a, 'clinic:manage', async () => true),
      ).rejects.toMatchObject({ statusCode: 403 })
      await withClinicTransaction(pool, identityA, a, 'settings:manage', async (connection) => {
        expect(
          (await connection.query('SELECT clinic_id FROM luminix.clinic_settings')).rows,
        ).toEqual([{ clinic_id: a }])
      })
    } finally {
      await db.exec('RESET ROLE')
    }
  })

  it('rolls back bootstrap and audit together if settings creation fails', async () => {
    const before = (await database.query('SELECT id FROM luminix.audit_logs')).rows.length
    await db.exec(`CREATE FUNCTION public.fail_settings() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$;
      CREATE TRIGGER fail_settings BEFORE INSERT ON luminix.clinic_settings FOR EACH ROW EXECUTE FUNCTION public.fail_settings();`)
    try {
      const response = await create('failure', { name: 'Must roll back' })
      expect(response.statusCode).toBe(503)
      expect(response.body).not.toMatch(/synthetic|INSERT|postgres/)
      for (const table of [
        'clinics',
        'roles',
        'clinic_memberships',
        'clinic_settings',
        'owner_clinic_bootstraps',
      ]) {
        expect((await database.query(`SELECT * FROM luminix.${table}`)).rows).toHaveLength(2)
      }
      expect((await database.query('SELECT id FROM luminix.audit_logs')).rows).toHaveLength(before)
    } finally {
      await db.exec(
        'DROP TRIGGER fail_settings ON luminix.clinic_settings; DROP FUNCTION public.fail_settings()',
      )
    }
  })

  it('requires explicit EXECUTE and never grants direct clinic writes or identity UPDATE', async () => {
    await db.exec('SET ROLE bootstrap_probe')
    try {
      await expect(
        database.query('SELECT * FROM luminix.bootstrap_owner_clinic($1, $2)', [
          identityB,
          'Clínica B',
        ]),
      ).rejects.toMatchObject({ code: '42501' })
    } finally {
      await db.exec('RESET ROLE')
    }
    await db.exec(
      'GRANT EXECUTE ON FUNCTION luminix.bootstrap_owner_clinic(uuid, text) TO bootstrap_probe; SET ROLE bootstrap_probe',
    )
    try {
      expect(
        (
          await database.query('SELECT * FROM luminix.bootstrap_owner_clinic($1, $2)', [
            identityB,
            'Clínica B',
          ])
        ).rows[0].clinic_id,
      ).toBe(b)
      await expect(
        database.query("INSERT INTO luminix.clinics(name, slug) VALUES ('forged', 'forged')"),
      ).rejects.toMatchObject({ code: '42501' })
      await expect(
        database.query("UPDATE luminix.identities SET status = 'disabled'"),
      ).rejects.toMatchObject({ code: '42501' })
    } finally {
      await db.exec('RESET ROLE')
    }
  })

  it('does not recreate a revoked owner clinic or reactivate disabled identities', async () => {
    await database.query(
      "UPDATE luminix.clinic_memberships SET status = 'revoked' WHERE identity_id = $1",
      [identityA],
    )
    expect((await create('a', { name: 'Clínica A' })).statusCode).toBe(403)
    await database.query("UPDATE luminix.identities SET status = 'disabled' WHERE id = $1", [
      identityB,
    ])
    expect((await create('b', { name: 'Clínica B' })).statusCode).toBe(403)
    expect((await database.query('SELECT id FROM luminix.clinics')).rows).toHaveLength(2)
  })
})
