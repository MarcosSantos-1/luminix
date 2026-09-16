import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { loadEnvFile } from 'node:process'
import { createDatabasePool } from '../src/shared/database/pool.js'
import { assertRuntimeDatabaseSecurity } from '../src/shared/database/runtime-security.js'

const envText = readFileSync('.env', 'utf8')
loadEnvFile('.env')
const direct = new URL(process.env.DATABASE_URL_UNPOOLED ?? '')
assert.equal(direct.hostname, 'ep-bitter-fog-acchavo1.sa-east-1.aws.neon.tech')
assert.equal(direct.pathname, '/neondb')
assert.ok(
  process.argv.includes('--allow-primary-runtime'),
  'Explicit runtime provisioning flag required',
)
const ownerPool = createDatabasePool({ ...process.env, DATABASE_URL: direct.toString() })
let runtimePool: ReturnType<typeof createDatabasePool> | undefined
try {
  assert.ok(
    (
      await ownerPool.query(
        "SELECT name FROM luminix_migrations.applied WHERE name = '0003_staff_authorization_runtime.sql'",
      )
    ).rowCount,
  )
  let runtimeUrl = process.env.DATABASE_URL_RUNTIME
  if (!runtimeUrl) {
    const role = (
      await ownerPool.query("SELECT rolcanlogin FROM pg_roles WHERE rolname = 'luminix_api'")
    ).rows[0]
    assert.ok(role)
    assert.equal(
      role.rolcanlogin,
      false,
      'Existing login without private credential requires explicit credential recovery/rotation',
    )
    const password = randomBytes(32).toString('hex')
    const pooled = new URL(process.env.DATABASE_URL ?? '')
    assert.equal(pooled.hostname, 'ep-bitter-fog-acchavo1-pooler.sa-east-1.aws.neon.tech')
    assert.equal(pooled.pathname, '/neondb')
    pooled.username = 'luminix_api'
    pooled.password = password
    runtimeUrl = pooled.toString()
    // Save private recovery material before enabling login; never print SQL/password on failure.
    const line = `DATABASE_URL_RUNTIME=${runtimeUrl}`
    writeFileSync(
      '.env',
      /^DATABASE_URL_RUNTIME=.*$/m.test(envText)
        ? envText.replace(/^DATABASE_URL_RUNTIME=.*$/m, line)
        : `${envText.trimEnd()}\n${line}\n`,
    )
    await ownerPool.query(`ALTER ROLE luminix_api LOGIN PASSWORD '${password}'`)
  }
  const target = new URL(runtimeUrl)
  assert.equal(target.username, 'luminix_api')
  assert.equal(target.hostname, 'ep-bitter-fog-acchavo1-pooler.sa-east-1.aws.neon.tech')
  assert.equal(target.pathname, '/neondb')
  runtimePool = createDatabasePool({ ...process.env, DATABASE_URL: runtimeUrl })
  await assertRuntimeDatabaseSecurity(runtimePool)
  console.log(
    'Runtime luminix_api connected and verified: no bypass/ownership/membership/DDL/table writes. Credential saved only in ignored apps/api/.env.',
  )
} catch {
  console.error(
    'Runtime provisioning failed; private env preserved; no credential or SQL details logged',
  )
  process.exitCode = 1
} finally {
  await runtimePool?.end()
  await ownerPool.end()
}
