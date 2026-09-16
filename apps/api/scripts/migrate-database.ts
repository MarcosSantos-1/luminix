import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'

import { applyMigrations } from '../src/shared/database/migrations.js'
import { createDatabasePool } from '../src/shared/database/pool.js'

if (existsSync('.env')) loadEnvFile('.env')

const args = process.argv.slice(2)
const applying = args.includes('--apply')
const verifying = args.includes('--verify')
const argument = (name: string) =>
  args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
const directUrl = process.env.DATABASE_URL_UNPOOLED
if (!directUrl) throw new Error('DATABASE_URL_UNPOOLED is required; no pooled fallback')
const destination = new URL(directUrl)
if (destination.hostname.includes('-pooler'))
  throw new Error('Migrations require a direct endpoint')
const database = decodeURIComponent(destination.pathname.slice(1))
if (
  (applying || verifying) &&
  (argument('expected-host') !== destination.hostname ||
    argument('expected-database') !== database ||
    !args.includes('--allow-primary-bootstrap'))
)
  throw new Error(
    'Apply requires explicit expected-host, expected-database and --allow-primary-bootstrap',
  )

const pool = createDatabasePool({ ...process.env, DATABASE_URL: directUrl })
const connection = await pool.connect()
let discard = false
try {
  console.log(`Database destination: ${destination.hostname}/${database}`)
  const server = await connection.query(
    `SELECT current_database() AS database, current_user AS role, current_setting('server_version') AS version`,
  )
  if (server.rows[0]?.database !== database)
    throw new Error('Connected database differs from expected destination')
  console.log('Server:', server.rows[0])
  const tables = await connection.query(
    `SELECT schemaname, tablename FROM pg_tables
     WHERE schemaname NOT IN ('pg_catalog', 'information_schema') ORDER BY schemaname, tablename`,
  )
  console.log('Existing user tables:', tables.rows)
  if (applying) {
    await connection.query("SET lock_timeout = '5s'")
    await connection.query("SET statement_timeout = '60s'")
    await applyMigrations(connection)
    console.log('Versioned migrations applied successfully')
  } else console.log('Status only; no schema changes')
  const core = await connection.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'luminix' ORDER BY tablename`,
  )
  console.log(
    'Luminix tables:',
    core.rows.map((row) => row.tablename),
  )
  if (verifying) {
    const a = randomUUID()
    const b = randomUUID()
    const identity = randomUUID()
    const roleA = randomUUID()
    const roleB = randomUUID()
    const professionalA = randomUUID()
    const serviceB = randomUUID()
    const testRole = `luminix_verify_${randomUUID().replaceAll('-', '')}`
    const owner = String(server.rows[0].role).replaceAll('"', '""')
    await connection.query('BEGIN')
    try {
      await connection.query("SET LOCAL lock_timeout = '5s'")
      await connection.query("SET LOCAL statement_timeout = '30s'")
      await connection.query('INSERT INTO luminix.identities (id) VALUES ($1)', [identity])
      for (const [clinic, role, label] of [
        [a, roleA, 'a'],
        [b, roleB, 'b'],
      ]) {
        await connection.query(
          "SELECT set_config('luminix.clinic_id', $1, true), set_config('luminix.identity_id', $2, true)",
          [clinic, identity],
        )
        await connection.query(
          "INSERT INTO luminix.clinics (id, name, slug, status) VALUES ($1, 'Verificação sintética', $2, 'active')",
          [clinic, `verify-${label}-${clinic}`],
        )
        await connection.query(
          "INSERT INTO luminix.roles (id, clinic_id, name) VALUES ($1, $2, 'Verificação')",
          [role, clinic],
        )
        await connection.query(
          'INSERT INTO luminix.clinic_memberships (clinic_id, identity_id, role_id) VALUES ($1, $2, $3)',
          [clinic, identity, role],
        )
      }
      await connection.query("SELECT set_config('luminix.clinic_id', $1, true)", [a])
      await connection.query(
        "INSERT INTO luminix.professionals (id, clinic_id, display_name) VALUES ($1, $2, 'Verificação A')",
        [professionalA, a],
      )
      await connection.query("SELECT set_config('luminix.clinic_id', $1, true)", [b])
      await connection.query(
        "INSERT INTO luminix.services (id, clinic_id, name, price_cents, duration_minutes) VALUES ($1, $2, 'Verificação B', 1000, 30)",
        [serviceB, b],
      )
      await connection.query("SELECT set_config('luminix.clinic_id', $1, true)", [a])
      const expectFailure = async (sql: string, values: unknown[], expectedCode: string) => {
        await connection.query('SAVEPOINT verification')
        let failedCode: string | undefined
        try {
          await connection.query(sql, values)
        } catch (error) {
          if (typeof error === 'object' && error !== null && 'code' in error)
            failedCode = String(error.code)
        }
        await connection.query('ROLLBACK TO SAVEPOINT verification')
        await connection.query('RELEASE SAVEPOINT verification')
        if (failedCode !== expectedCode) throw new Error('Database invariant verification failed')
      }
      await expectFailure(
        'INSERT INTO luminix.professional_services VALUES ($1, $2, $3)',
        [a, professionalA, serviceB],
        '23503',
      )
      await connection.query(`CREATE ROLE "${testRole}" NOLOGIN NOSUPERUSER NOBYPASSRLS`)
      await connection.query(`GRANT "${testRole}" TO "${owner}"`)
      await connection.query(`GRANT USAGE ON SCHEMA luminix TO "${testRole}"`)
      await connection.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON luminix.services TO "${testRole}"`,
      )
      await connection.query(`GRANT SELECT ON luminix.audit_logs TO "${testRole}"`)
      await connection.query(`SET LOCAL ROLE "${testRole}"`)
      const invisible = await connection.query('SELECT id FROM luminix.services WHERE id = $1', [
        serviceB,
      ])
      if (invisible.rows.length) throw new Error('Cross-clinic visibility detected')
      await expectFailure(
        "INSERT INTO luminix.services (clinic_id, name, price_cents, duration_minutes) VALUES ($1, 'Cross tenant', 100, 30)",
        [b],
        '42501',
      )
      await expectFailure(
        "INSERT INTO luminix.services (clinic_id, name, price_cents, duration_minutes) VALUES ($1, 'Invalid price', -1, 30)",
        [a],
        '23514',
      )
      await connection.query(
        "INSERT INTO luminix.services (clinic_id, name, price_cents, duration_minutes) VALUES ($1, 'Verificação A', 2000, 30)",
        [a],
      )
      const audit = await connection.query(
        "SELECT actor_identity_id FROM luminix.audit_logs WHERE entity_table = 'services' AND clinic_id = $1",
        [a],
      )
      if (audit.rows.length !== 1 || audit.rows[0].actor_identity_id !== identity)
        throw new Error('Audit verification failed')
      await connection.query("SELECT set_config('luminix.clinic_id', '', true)")
      if ((await connection.query('SELECT id FROM luminix.services')).rows.length)
        throw new Error('Missing-context isolation failed')
    } finally {
      await connection.query('ROLLBACK')
    }
    console.log(
      'Neon verification passed: cross-clinic FK, restricted-role RLS, missing context, price constraints and audit; synthetic data/role rolled back',
    )
  }
} catch (error) {
  discard = true
  // Do not print pg connection details or secrets from error objects.
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : 'migration_error'
  console.error(`Database operation failed (${code})`)
  process.exitCode = 1
} finally {
  connection.release(discard)
  await pool.end()
}
