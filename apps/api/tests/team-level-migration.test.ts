import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Migration 0053 on a database that already has clinics with Recepção and Profissional.
const directory = new URL('../migrations/', import.meta.url)
let db: PGlite
const query = async (sql: string, values?: unknown[]) =>
  (await db.query<Record<string, string>>(sql, values)).rows

async function run(filter: (file: string) => boolean) {
  const files = (await readdir(directory)).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort()
  for (const file of files.filter(filter))
    await db.exec(await readFile(new URL(file, directory), 'utf8'))
}

let clinic = ''
const members: Record<string, string> = {}

beforeAll(async () => {
  db = new PGlite()
  await run((file) => file < '0053')
  const owner = (await query('SELECT * FROM luminix.resolve_staff_identity($1)', ['owner']))[0]
    .identity_id
  clinic = (
    await query('SELECT * FROM luminix.bootstrap_owner_clinic($1::uuid, $2)', [owner, 'Espaço'])
  )[0].clinic_id
  await query("SELECT set_config('luminix.clinic_id', $1, false)", [clinic])
  for (const role of ['reception', 'professional']) {
    const identity = (await query('SELECT * FROM luminix.resolve_staff_identity($1)', [role]))[0]
      .identity_id
    members[role] = (
      await query(
        `INSERT INTO luminix.clinic_memberships (clinic_id, identity_id, role_id)
         SELECT $1, $2, id FROM luminix.roles WHERE clinic_id = $1 AND name = $3 RETURNING id`,
        [clinic, identity, role],
      )
    )[0].id
  }
  // The owner had turned vacations on for Recepção and agenda off for both.
  await query(
    `INSERT INTO luminix.role_permission_choices (clinic_id, role_name, permission_code, enabled)
     VALUES ($1, 'reception', 'vacation:manage', true), ($1, 'reception', 'agenda:manage', false),
            ($1, 'professional', 'agenda:manage', false)`,
    [clinic],
  )
  await query('SELECT luminix.ensure_clinic_roles($1)', [clinic])
  await run((file) => file.startsWith('0053'))
})

afterAll(async () => {
  await db.close()
})

describe('0053: Recepção and Profissional become Equipe', () => {
  it('moves both old levels to Equipe and removes them', async () => {
    const roles = await query(
      `SELECT r.name FROM luminix.clinic_memberships m
         JOIN luminix.roles r ON r.clinic_id = m.clinic_id AND r.id = m.role_id
        WHERE m.id = ANY($1::uuid[])`,
      [[members.reception, members.professional]],
    )
    expect(roles.map((row) => row.name)).toEqual(['team', 'team'])
    const names = await query('SELECT name FROM luminix.roles WHERE clinic_id = $1 ORDER BY name', [
      clinic,
    ])
    expect(names.map((row) => row.name)).toEqual(['manager', 'owner', 'team'])
  })

  it('keeps every option that either level had on, and what both had off', async () => {
    const grants = (
      await query(
        `SELECT p.permission_code FROM luminix.role_permissions p
           JOIN luminix.roles r ON r.clinic_id = p.clinic_id AND r.id = p.role_id
          WHERE r.clinic_id = $1 AND r.name = 'team' ORDER BY 1`,
        [clinic],
      )
    ).map((row) => row.permission_code)
    // Vacations came from Recepção, marketing from Profissional's default.
    expect(grants).toContain('vacation:manage')
    expect(grants).toContain('marketing:manage')
    expect(grants).toContain('client:manage')
    expect(grants).not.toContain('agenda:manage')
    expect(grants).not.toContain('finance:manage')
  })
})
