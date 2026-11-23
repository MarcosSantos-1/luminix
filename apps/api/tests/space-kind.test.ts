import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { applyMigrations, type SqlConnection } from '../src/shared/database/migrations.js'

const ids = {
  clinic: '00000000-0000-4000-8000-000000000101',
  identity: '00000000-0000-4000-8000-000000000102',
  role: '00000000-0000-4000-8000-000000000103',
  member: '00000000-0000-4000-8000-000000000104',
  evaluation: '00000000-0000-4000-8000-000000000105',
  treatment: '00000000-0000-4000-8000-000000000106',
}
let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  const connection: SqlConnection = {
    async query(sql, values) {
      if (values) return db.query(sql, values)
      const results = await db.exec(sql)
      return { rows: results.at(-1)?.rows ?? [] }
    },
  }
  await applyMigrations(connection)
})

afterAll(async () => {
  await db.close()
})

const one = async <T>(sql: string, values: unknown[] = []) =>
  (await db.query<T>(sql, values)).rows[0]

describe('space kind and evaluations (0062)', () => {
  it('puts the kind in front of the name once', async () => {
    const name = (kind: string | null, value: string) =>
      one<{ name: string }>('SELECT luminix.space_display_name($1, $2) AS name', [kind, value])
    expect((await name('studio', 'Luniere'))?.name).toBe('Studio Luniere')
    expect((await name('studio', 'studio Luniere'))?.name).toBe('studio Luniere')
    expect((await name('clinica', ' Bela '))?.name).toBe('Clínica Bela')
    expect((await name('spa', 'SPA'))?.name).toBe('SPA')
    expect((await name(null, 'Luniere'))?.name).toBe('Luniere')
  })

  it('follows the draft and composes the name when the space opens', async () => {
    await db.exec(`
      INSERT INTO luminix.identities (id) VALUES ('${ids.identity}');
      INSERT INTO luminix.clinics (id, name, slug, status)
        VALUES ('${ids.clinic}', 'Luniere', 'luniere', 'draft');
      INSERT INTO luminix.roles (id, clinic_id, name) VALUES ('${ids.role}', '${ids.clinic}', 'Gestora');
      INSERT INTO luminix.clinic_memberships (id, clinic_id, identity_id, role_id)
        VALUES ('${ids.member}', '${ids.clinic}', '${ids.identity}', '${ids.role}');
    `)
    await db.query(
      `INSERT INTO luminix.onboarding_drafts (clinic_id, created_by_membership_id, payload)
       VALUES ($1, $2, $3::jsonb)`,
      [
        ids.clinic,
        ids.member,
        JSON.stringify({
          name: 'Luniere',
          clinic: { spaceKind: 'studio' },
          services: [{ name: 'Avaliação facial', evaluation: true }, { name: 'Limpeza de pele' }],
        }),
      ],
    )
    expect(
      (
        await one<{ space_kind: string }>('SELECT space_kind FROM luminix.clinics WHERE id = $1', [
          ids.clinic,
        ])
      )?.space_kind,
    ).toBe('studio')

    await db.exec(`
      INSERT INTO luminix.services (id, clinic_id, name, price_cents, duration_minutes) VALUES
        ('${ids.evaluation}', '${ids.clinic}', 'Avaliação facial', 0, 30),
        ('${ids.treatment}', '${ids.clinic}', 'Limpeza de pele', 18000, 60);
      UPDATE luminix.clinics SET status = 'active' WHERE id = '${ids.clinic}';
    `)
    expect(
      (await one<{ name: string }>('SELECT name FROM luminix.clinics WHERE id = $1', [ids.clinic]))
        ?.name,
    ).toBe('Studio Luniere')
  })

  it('marks only the evaluations of the draft when it is completed', async () => {
    // Only the evaluation trigger matters here; the other completion triggers need a full draft.
    await db.exec(`
      ALTER TABLE luminix.onboarding_drafts DISABLE TRIGGER USER;
      ALTER TABLE luminix.onboarding_drafts ENABLE TRIGGER persist_onboarding_space_kind;
      UPDATE luminix.onboarding_drafts SET status = 'completed' WHERE clinic_id = '${ids.clinic}';
      ALTER TABLE luminix.onboarding_drafts ENABLE TRIGGER USER;
    `)
    const rows = (
      await db.query<{ name: string; is_evaluation: boolean }>(
        'SELECT name, is_evaluation FROM luminix.services WHERE clinic_id = $1 ORDER BY name',
        [ids.clinic],
      )
    ).rows
    expect(rows).toEqual([
      { name: 'Avaliação facial', is_evaluation: true },
      { name: 'Limpeza de pele', is_evaluation: false },
    ])
  })
})
