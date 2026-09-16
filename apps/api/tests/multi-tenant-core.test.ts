import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { applyMigrations, type SqlConnection } from '../src/shared/database/migrations.js'
import { withClinicTransaction } from '../src/shared/tenant/clinic-transaction.js'

const ids = {
  a: '00000000-0000-4000-8000-000000000001',
  b: '00000000-0000-4000-8000-000000000002',
  user: '00000000-0000-4000-8000-000000000003',
  outsider: '00000000-0000-4000-8000-000000000004',
  roleA: '00000000-0000-4000-8000-000000000005',
  roleB: '00000000-0000-4000-8000-000000000006',
  memberA: '00000000-0000-4000-8000-000000000007',
  memberB: '00000000-0000-4000-8000-000000000008',
  professionalA: '00000000-0000-4000-8000-000000000009',
  professionalB: '00000000-0000-4000-8000-000000000010',
  occupationA: '00000000-0000-4000-8000-000000000011',
  occupationB: '00000000-0000-4000-8000-000000000012',
  serviceA: '00000000-0000-4000-8000-000000000013',
  serviceB: '00000000-0000-4000-8000-000000000014',
}
let db: PGlite
let connection: SqlConnection
const pool = { connect: async () => ({ ...connection, release: () => {} }) }

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
  // Synthetic fixtures only, as the migration owner. Never connects to Neon.
  await db.exec(`
    INSERT INTO luminix.identities (id) VALUES ('${ids.user}'), ('${ids.outsider}');
    INSERT INTO luminix.clinics (id, name, slug, status) VALUES
      ('${ids.a}', 'Clínica A', 'clinica-a', 'active'), ('${ids.b}', 'Clínica B', 'clinica-b', 'active');
    INSERT INTO luminix.roles (id, clinic_id, name) VALUES
      ('${ids.roleA}', '${ids.a}', 'Gestora'), ('${ids.roleB}', '${ids.b}', 'Gestora');
    INSERT INTO luminix.role_permissions VALUES
      ('${ids.a}', '${ids.roleA}', 'service:manage'), ('${ids.b}', '${ids.roleB}', 'service:manage');
    INSERT INTO luminix.clinic_memberships (id, clinic_id, identity_id, role_id) VALUES
      ('${ids.memberA}', '${ids.a}', '${ids.user}', '${ids.roleA}'),
      ('${ids.memberB}', '${ids.b}', '${ids.user}', '${ids.roleB}');
    INSERT INTO luminix.professionals (id, clinic_id, membership_id, display_name) VALUES
      ('${ids.professionalA}', '${ids.a}', '${ids.memberA}', 'Profissional A'),
      ('${ids.professionalB}', '${ids.b}', '${ids.memberB}', 'Profissional B');
    INSERT INTO luminix.occupations (id, clinic_id, name) VALUES
      ('${ids.occupationA}', '${ids.a}', 'Estética'), ('${ids.occupationB}', '${ids.b}', 'Estética');
    INSERT INTO luminix.services (id, clinic_id, name, price_cents, duration_minutes) VALUES
      ('${ids.serviceA}', '${ids.a}', 'Serviço A', 12500, 60),
      ('${ids.serviceB}', '${ids.b}', 'Serviço B', 10000, 30);
    CREATE ROLE tenant_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
    GRANT USAGE ON SCHEMA luminix TO tenant_test;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA luminix TO tenant_test;
    REVOKE ALL ON luminix.identities, luminix.client_profiles, luminix.permissions, luminix.audit_logs FROM tenant_test;
    GRANT SELECT (id, status) ON luminix.identities TO tenant_test;
    GRANT SELECT ON luminix.permissions, luminix.audit_logs TO tenant_test;
    GRANT EXECUTE ON FUNCTION luminix.authorize_staff_clinic(uuid, uuid, text) TO tenant_test;
  `)
}, 30000)

afterAll(async () => {
  await db?.close()
})

async function rejected(sql: string, values: unknown[], code: string) {
  await expect(db.query(sql, values)).rejects.toMatchObject({ code })
}

async function asRuntime<T>(work: () => Promise<T>): Promise<T> {
  await db.exec('SET ROLE tenant_test')
  try {
    return await work()
  } finally {
    await db.exec('RESET ROLE')
  }
}

describe('versioned core migration', () => {
  it('rolls back the entire schema and ledger when migration application fails', async () => {
    const isolated = new PGlite()
    try {
      const failingConnection: SqlConnection = {
        async query(sql, values) {
          if (values) return isolated.query(sql, values)
          const results = await isolated.exec(sql)
          if (sql.includes('CREATE SCHEMA luminix;')) throw new Error('Simulated migration failure')
          return { rows: results.at(-1)?.rows ?? [] }
        },
      }
      await expect(applyMigrations(failingConnection)).rejects.toThrow(
        'Simulated migration failure',
      )
      const result = await isolated.query(
        "SELECT nspname FROM pg_namespace WHERE nspname IN ('luminix', 'luminix_migrations')",
      )
      expect(result.rows).toEqual([])
    } finally {
      await isolated.close()
    }
  })

  it('can be reapplied without duplicating schema or fixtures', async () => {
    await applyMigrations(connection)
    expect(
      (await db.query('SELECT name FROM luminix_migrations.applied ORDER BY name')).rows,
    ).toEqual([
      { name: '0001_multi_tenant_core.sql' },
      { name: '0002_owner_clinic_bootstrap.sql' },
      { name: '0003_staff_authorization_runtime.sql' },
      { name: '0004_onboarding.sql' },
    ])
  })

  it('rejects modified migrations and rolls back the migration transaction', async () => {
    await db.exec("UPDATE luminix_migrations.applied SET checksum = 'invalid'")
    await expect(applyMigrations(connection)).rejects.toThrow('checksum changed')
    // Restore the real checksum without modifying the versioned file.
    const { createHash } = await import('node:crypto')
    const { readFile } = await import('node:fs/promises')
    const sql = await readFile(
      new URL('../migrations/0001_multi_tenant_core.sql', import.meta.url),
      'utf8',
    )
    await db.query('UPDATE luminix_migrations.applied SET checksum = $1', [
      createHash('sha256').update(sql).digest('hex'),
    ])
  })
})

describe('Clinic A × Clinic B foreign keys', () => {
  it('keeps one global client profile with independent local registrations and contacts', async () => {
    const profile = await db.query<{ id: string }>(
      'INSERT INTO luminix.client_profiles (identity_id) VALUES ($1) RETURNING id',
      [ids.outsider],
    )
    await db.query(
      "INSERT INTO luminix.clinic_clients (clinic_id, client_profile_id, display_name, contact_phone) VALUES ($1, $2, 'Cliente A', '+5511999990001'), ($3, $2, 'Cliente B', '+5511999990002')",
      [ids.a, profile.rows[0].id, ids.b],
    )
    await asRuntime(async () => {
      await withClinicTransaction(pool, ids.user, ids.a, 'service:manage', async (client) => {
        const result = await client.query(
          'SELECT display_name, contact_phone FROM luminix.clinic_clients',
        )
        expect(result.rows).toEqual([
          { display_name: 'Cliente A', contact_phone: '+5511999990001' },
        ])
      })
    })
    await rejected(
      "INSERT INTO luminix.clinic_clients (clinic_id, client_profile_id, display_name) VALUES ($1, $2, 'Duplicado')",
      [ids.a, profile.rows[0].id],
      '23505',
    )
    await db.query('UPDATE luminix.clinic_memberships SET status = $1 WHERE id = $2', [
      'revoked',
      ids.memberB,
    ])
    expect(
      (await db.query('SELECT * FROM luminix.clinic_clients WHERE clinic_id = $1', [ids.b])).rows,
    ).toHaveLength(1)
    await db.query('UPDATE luminix.clinic_memberships SET status = $1 WHERE id = $2', [
      'active',
      ids.memberB,
    ])
  })

  it.each([
    [
      'membership role',
      'INSERT INTO luminix.clinic_memberships (clinic_id, identity_id, role_id) VALUES ($1, $2, $3)',
      [ids.a, ids.outsider, ids.roleB],
    ],
    [
      'professional membership',
      "INSERT INTO luminix.professionals (clinic_id, membership_id, display_name) VALUES ($1, $2, 'Cross tenant')",
      [ids.a, ids.memberB],
    ],
    [
      'professional occupation',
      'INSERT INTO luminix.professional_occupations VALUES ($1, $2, $3)',
      [ids.a, ids.professionalA, ids.occupationB],
    ],
    [
      'occupation professional',
      'INSERT INTO luminix.professional_occupations VALUES ($1, $2, $3)',
      [ids.a, ids.professionalB, ids.occupationA],
    ],
    [
      'professional service',
      'INSERT INTO luminix.professional_services VALUES ($1, $2, $3)',
      [ids.a, ids.professionalA, ids.serviceB],
    ],
    [
      'service professional',
      'INSERT INTO luminix.professional_services VALUES ($1, $2, $3)',
      [ids.a, ids.professionalB, ids.serviceA],
    ],
    [
      'role permission',
      'INSERT INTO luminix.role_permissions VALUES ($1, $2, $3)',
      [ids.a, ids.roleB, 'client:read'],
    ],
    [
      'draft author',
      'INSERT INTO luminix.onboarding_drafts (clinic_id, created_by_membership_id) VALUES ($1, $2)',
      [ids.a, ids.memberB],
    ],
  ])('rejects foreign-clinic %s even with owner privileges', async (_name, sql, values) => {
    await rejected(sql, values, '23503')
  })

  it('accepts same-clinic relationships', async () => {
    await db.query('INSERT INTO luminix.professional_services VALUES ($1, $2, $3)', [
      ids.a,
      ids.professionalA,
      ids.serviceA,
    ])
    await db.query('INSERT INTO luminix.professional_occupations VALUES ($1, $2, $3)', [
      ids.a,
      ids.professionalA,
      ids.occupationA,
    ])
  })

  it('does not allow moving an unreferenced entity to another clinic', async () => {
    const result = await db.query<{ id: string }>(
      "INSERT INTO luminix.occupations (clinic_id, name) VALUES ($1, 'Imutável') RETURNING id",
      [ids.a],
    )
    await rejected(
      'UPDATE luminix.occupations SET clinic_id = $1 WHERE id = $2',
      [ids.b, result.rows[0].id],
      '23514',
    )
  })
})

describe('authorized database scope', () => {
  it('discards a connection if rollback fails, preserving the original denial', async () => {
    let discarded: boolean | undefined
    const brokenPool = {
      async connect() {
        return {
          async query(sql: string) {
            if (sql === 'ROLLBACK') throw new Error('Disconnected during rollback')
            return { rows: [] }
          },
          release(discard?: boolean) {
            discarded = discard
          },
        }
      },
    }
    await expect(
      withClinicTransaction(
        brokenPool,
        ids.user,
        ids.a,
        'service:manage',
        async () => 'unexpected',
      ),
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(discarded).toBe(true)
  })

  it('enforces RLS on every tenant table and FORCE on the owner as well', async () => {
    const tables = await db.query<{
      relname: string
      relrowsecurity: boolean
      relforcerowsecurity: boolean
    }>(
      "SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relnamespace = 'luminix'::regnamespace AND relkind = 'r' AND relname NOT IN ('identities', 'client_profiles', 'permissions')",
    )
    expect(tables.rows).toHaveLength(14)
    expect(tables.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true)
  })

  it('fails closed without clinic context, including writes', async () => {
    await asRuntime(async () => {
      expect((await db.query('SELECT * FROM luminix.services')).rows).toEqual([])
      await rejected(
        "INSERT INTO luminix.services (clinic_id, name, price_cents, duration_minutes) VALUES ($1, 'Denied', 0, 1)",
        [ids.a],
        '42501',
      )
    })
  })

  it('derives context from a membership and hides valid IDs of another clinic', async () => {
    await asRuntime(async () => {
      await withClinicTransaction(
        pool,
        ids.user,
        ids.a,
        'service:manage',
        async (client, tenant) => {
          expect(tenant).toMatchObject({
            clinicId: ids.a,
            membershipId: ids.memberA,
            userId: ids.user,
          })
          expect(
            (await client.query('SELECT * FROM luminix.services WHERE id = $1', [ids.serviceB]))
              .rows,
          ).toEqual([])
          expect(
            (
              await client.query(
                'UPDATE luminix.services SET price_cents = 1 WHERE id = $1 RETURNING id',
                [ids.serviceB],
              )
            ).rows,
          ).toEqual([])
          expect((await client.query('SELECT * FROM luminix.services')).rows).toHaveLength(1)
        },
      )
      expect((await db.query('SELECT * FROM luminix.services')).rows).toEqual([])
    })
  })

  it('rejects inserting a B-owned resource inside an authorized A transaction', async () => {
    await asRuntime(async () => {
      await expect(
        withClinicTransaction(pool, ids.user, ids.a, 'service:manage', async (client) => {
          await client.query(
            "INSERT INTO luminix.services (clinic_id, name, price_cents, duration_minutes) VALUES ($1, 'Denied B', 100, 30)",
            [ids.b],
          )
        }),
      ).rejects.toMatchObject({ code: '42501' })
      expect((await db.query('SELECT * FROM luminix.services')).rows).toEqual([])
    })
  })

  it('allows a multi-clinic user to switch only with a fresh authorized membership', async () => {
    await asRuntime(async () => {
      for (const clinic of [ids.a, ids.b, ids.a]) {
        await withClinicTransaction(
          pool,
          ids.user,
          clinic,
          'service:manage',
          async (client, tenant) => {
            expect(tenant.clinicId).toBe(clinic)
            const rows = (await client.query('SELECT clinic_id FROM luminix.services')).rows
            expect(rows.every((row) => row.clinic_id === clinic)).toBe(true)
          },
        )
      }
    })
  })

  it('rejects outsiders and missing permission before executing domain work', async () => {
    await asRuntime(async () => {
      const work = async () => {
        throw new Error('Domain work must not execute')
      }
      await expect(
        withClinicTransaction(pool, ids.outsider, ids.b, 'service:manage', work),
      ).rejects.toMatchObject({ statusCode: 403 })
      await expect(
        withClinicTransaction(pool, ids.user, ids.a, 'team:manage', work),
      ).rejects.toMatchObject({ statusCode: 403 })
      await expect(
        withClinicTransaction(pool, ids.user, 'malformed-clinic', 'service:manage', work),
      ).rejects.toMatchObject({ statusCode: 403 })
    })
  })

  it('revocation, identity disablement and clinic suspension deny subsequent access', async () => {
    for (const [table, column, id, status, restore] of [
      ['clinic_memberships', 'id', ids.memberA, 'revoked', 'active'],
      ['identities', 'id', ids.user, 'disabled', 'active'],
      ['clinics', 'id', ids.a, 'suspended', 'active'],
    ]) {
      await db.query(`UPDATE luminix.${table} SET status = $1 WHERE ${column} = $2`, [status, id])
      try {
        await asRuntime(async () => {
          await expect(
            withClinicTransaction(
              pool,
              ids.user,
              ids.a,
              'service:manage',
              async () => 'unexpected',
            ),
          ).rejects.toMatchObject({ statusCode: 403 })
        })
      } finally {
        await db.query(`UPDATE luminix.${table} SET status = $1 WHERE ${column} = $2`, [
          restore,
          id,
        ])
      }
    }
  })

  it('permission removal immediately denies the next operation', async () => {
    await db.query('DELETE FROM luminix.role_permissions WHERE clinic_id = $1', [ids.a])
    try {
      await asRuntime(async () => {
        await expect(
          withClinicTransaction(pool, ids.user, ids.a, 'service:manage', async () => 'unexpected'),
        ).rejects.toMatchObject({ statusCode: 403 })
      })
    } finally {
      await db.query('INSERT INTO luminix.role_permissions VALUES ($1, $2, $3)', [
        ids.a,
        ids.roleA,
        'service:manage',
      ])
    }
  })

  it('runtime cannot read global client profiles or change identities', async () => {
    await asRuntime(async () => {
      await rejected('SELECT * FROM luminix.client_profiles', [], '42501')
      await rejected(
        'UPDATE luminix.identities SET status = $1 WHERE id = $2',
        ['disabled', ids.user],
        '42501',
      )
    })
  })
})

describe('prices and transactional audit', () => {
  it.each([
    [-1, 'BRL', 30, '23514'],
    ['12.50', 'BRL', 30, '22P02'],
    [2147483648, 'BRL', 30, '22003'],
    [100, 'USD', 30, '23514'],
    [100, 'BRL', 0, '23514'],
    [null, 'BRL', 30, '23502'],
  ])(
    'rejects invalid price/currency/duration (%s, %s, %s)',
    async (price, currency, duration, code) => {
      await rejected(
        "INSERT INTO luminix.services (clinic_id, name, price_cents, currency, duration_minutes) VALUES ($1, 'Inválido', $2, $3, $4)",
        [ids.a, price, currency, duration],
        code,
      )
    },
  )

  it('audits price changes with the authorized actor, without sensitive values', async () => {
    await asRuntime(async () => {
      await withClinicTransaction(pool, ids.user, ids.a, 'service:manage', async (client) => {
        await client.query('UPDATE luminix.services SET price_cents = $1 WHERE id = $2', [
          13000,
          ids.serviceA,
        ])
      })
    })
    const result = await db.query<{
      actor_identity_id: string
      changed_fields: string[]
      entity_key: unknown
    }>(
      "SELECT * FROM luminix.audit_logs WHERE entity_table = 'services' AND action = 'UPDATE' AND clinic_id = $1 ORDER BY created_at DESC LIMIT 1",
      [ids.a],
    )
    expect(result.rows[0].actor_identity_id).toBe(ids.user)
    expect(result.rows[0].changed_fields).toEqual(['price_cents'])
    expect(result.rows[0].entity_key).toEqual({ id: ids.serviceA, clinic_id: ids.a })
  })

  it('rolls back both business changes and audit, and clears transaction scope', async () => {
    const before = (await db.query('SELECT * FROM luminix.audit_logs')).rows.length
    await asRuntime(async () => {
      await expect(
        withClinicTransaction(pool, ids.user, ids.a, 'service:manage', async (client) => {
          await client.query('UPDATE luminix.services SET price_cents = 999 WHERE id = $1', [
            ids.serviceA,
          ])
          throw new Error('Simulated failure')
        }),
      ).rejects.toThrow('Simulated failure')
      expect((await db.query('SELECT * FROM luminix.services')).rows).toEqual([])
    })
    expect((await db.query('SELECT * FROM luminix.audit_logs')).rows).toHaveLength(before)
    expect(
      (await db.query('SELECT price_cents FROM luminix.services WHERE id = $1', [ids.serviceA]))
        .rows[0],
    ).toEqual({ price_cents: 13000 })
  })

  it('prevents audit editing, deletion, truncation and direct runtime insertion', async () => {
    await rejected('UPDATE luminix.audit_logs SET action = $1', ['DELETE'], '42501')
    await rejected('DELETE FROM luminix.audit_logs', [], '42501')
    await expect(db.exec('TRUNCATE luminix.audit_logs')).rejects.toMatchObject({ code: '42501' })
    await asRuntime(async () => {
      await rejected(
        "INSERT INTO luminix.audit_logs (clinic_id, database_actor, entity_table, entity_key, action, changed_fields) VALUES ($1, 'forged', 'services', '{}', 'INSERT', '{}')",
        [ids.a],
        '42501',
      )
    })
  })
})
