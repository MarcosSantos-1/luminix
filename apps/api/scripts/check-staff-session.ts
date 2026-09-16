import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { loadEnvFile } from 'node:process'
import { parseEnv } from 'node:util'
import type { PoolClient } from 'pg'

import { buildApp } from '../src/app.js'
import { createDatabasePool } from '../src/shared/database/pool.js'
import { assertRuntimeDatabaseSecurity } from '../src/shared/database/runtime-security.js'
import {
  getFirebaseAdminAuth,
  verifyFirebaseIdToken,
} from '../src/shared/integrations/firebase/admin.js'

// Explicit disposable fixture check for the initially authorized, customer-free environment.
loadEnvFile('.env')
const adminEnv = parseEnv(readFileSync('../admin/.env.local', 'utf8'))
const target = new URL(process.env.DATABASE_URL ?? '')
assert.equal(target.hostname, 'ep-bitter-fog-acchavo1-pooler.sa-east-1.aws.neon.tech')
assert.equal(target.pathname, '/neondb')
assert.equal(process.env.FIREBASE_PROJECT_ID, 'luminix-316aa')
assert.equal(adminEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID, process.env.FIREBASE_PROJECT_ID)
assert.ok(process.argv.includes('--allow-primary-fixture'), 'Explicit fixture flag required')
assert.ok(adminEnv.NEXT_PUBLIC_FIREBASE_API_KEY, 'Firebase Web configuration required')
console.log('Confirmed: Firebase luminix-316aa; Neon existing endpoint, neondb / luminix')

const auth = getFirebaseAdminAuth()
const pool = createDatabasePool()
const connection = await pool.connect()
let app: Awaited<ReturnType<typeof buildApp>> | undefined
let uid: string | undefined
let begun = false
let discard = false
let stage = 'connection'
try {
  const result = await connection.query(
    'SELECT current_database() AS name, to_regclass($1) AS identities',
    ['luminix.identities'],
  )
  assert.equal(result.rows[0].name, 'neondb')
  assert.ok(result.rows[0].identities)
  // Committed synthetic identity lets the second connection see and contend on the same row.
  // Both bootstrap transactions roll back; the identity is deleted explicitly in finally.
  const concurrentIdentity = randomUUID()
  await connection.query('INSERT INTO luminix.identities (id) VALUES ($1)', [concurrentIdentity])
  let contender: PoolClient | undefined
  let discardContender = false
  try {
    contender = await pool.connect()
    await connection.query('BEGIN')
    await contender.query('BEGIN')
    await contender.query("SET LOCAL lock_timeout = '500ms'")
    const heldClinic = (
      await connection.query('SELECT * FROM luminix.bootstrap_owner_clinic($1, $2)', [
        concurrentIdentity,
        'Synthetic concurrent owner',
      ])
    ).rows[0].clinic_id
    await assert.rejects(
      contender.query('SELECT * FROM luminix.bootstrap_owner_clinic($1, $2)', [
        concurrentIdentity,
        'Synthetic concurrent owner',
      ]),
      (error: unknown) => (error as { code?: string }).code === '55P03',
    )
    await contender.query('ROLLBACK')
    await connection.query('ROLLBACK')
    assert.equal(
      (await connection.query('SELECT id FROM luminix.clinics WHERE id = $1', [heldClinic])).rows
        .length,
      0,
    )
    console.log(
      'PASS: concurrent Neon connections serialize bootstrap; lock timeout fails safely; rollback leaves no clinic',
    )
  } finally {
    try {
      await connection.query('ROLLBACK')
    } catch {
      discard = true
    }
    if (contender) {
      try {
        await contender.query('ROLLBACK')
      } catch {
        discardContender = true
      }
      contender.release(discardContender)
    }
    await pool.query('DELETE FROM luminix.identities WHERE id = $1', [concurrentIdentity])
  }
  await connection.query('BEGIN')
  begun = true
  const email = `luminix-auth-check-${randomUUID()}@example.invalid`
  const password = randomBytes(24).toString('base64url')
  uid = (await auth.createUser({ email, password })).uid
  stage = 'firebase_password'
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(adminEnv.NEXT_PUBLIC_FIREBASE_API_KEY)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
      signal: AbortSignal.timeout(15_000),
    },
  )
  assert.equal(response.status, 200, 'Firebase password provider must permit login')
  const { idToken } = (await response.json()) as { idToken: string }
  assert.ok(idToken)
  // Test-only savepoint adapter keeps HTTP domain transactions inside the disposable fixture.
  const fixturePool = {
    connect: async () => ({
      async query(sql: string, values?: unknown[]) {
        if (sql === 'BEGIN') return connection.query('SAVEPOINT http_domain_probe')
        if (sql === 'ROLLBACK') {
          await connection.query('ROLLBACK TO SAVEPOINT http_domain_probe')
          await connection.query('RELEASE SAVEPOINT http_domain_probe')
          return connection.query(
            "SELECT set_config('luminix.clinic_id', '', true), set_config('luminix.identity_id', '', true)",
          )
        }
        if (sql === 'COMMIT') {
          await connection.query('RELEASE SAVEPOINT http_domain_probe')
          return connection.query(
            "SELECT set_config('luminix.clinic_id', '', true), set_config('luminix.identity_id', '', true)",
          )
        }
        return connection.query(sql, values)
      },
      release() {},
    }),
  }
  app = await buildApp(
    {},
    { database: connection, tenantPool: fixturePool, verifyToken: verifyFirebaseIdToken },
  )
  const session = (token = idToken) =>
    app!.inject({
      url: '/auth/session',
      headers: {
        authorization: `Bearer ${token}`,
        'x-clinic-id': randomUUID(),
        'x-identity-id': randomUUID(),
      },
    })
  const first = await session()
  stage = 'session'
  assert.equal(first.statusCode, 200)
  assert.equal((await session()).json().identity.id, first.json().identity.id)
  const createClinic = () =>
    app!.inject({
      method: 'POST',
      url: '/auth/owner-clinic',
      payload: { name: 'Synthetic owner clinic A' },
      headers: {
        authorization: `Bearer ${idToken}`,
        'x-identity-id': randomUUID(),
        'x-clinic-id': randomUUID(),
      },
    })
  const clinicA = await createClinic()
  stage = 'bootstrap_a'
  assert.equal(clinicA.statusCode, 201)
  const clinicAId = clinicA.json().clinic.id as string
  assert.equal((await createClinic()).json().clinic.id, clinicAId)
  const ownerAId = first.json().identity.id as string
  const ownerBId = randomUUID()
  await connection.query('INSERT INTO luminix.identities (id, firebase_uid) VALUES ($1, $2)', [
    ownerBId,
    `synthetic-bootstrap-${randomUUID()}`,
  ])
  const clinicBId = (
    await connection.query('SELECT * FROM luminix.bootstrap_owner_clinic($1, $2)', [
      ownerBId,
      'Synthetic owner clinic B',
    ])
  ).rows[0].clinic_id
  const domain = (path: string) =>
    app!.inject({
      url: path,
      headers: {
        authorization: `Bearer ${idToken}`,
        'x-identity-id': ownerBId,
        'x-clinic-id': clinicBId,
      },
    })
  const migrationRole = String(
    (await connection.query('SELECT current_user AS name')).rows[0].name,
  ).replaceAll('"', '""')
  await connection.query(`GRANT luminix_api TO "${migrationRole}"`)
  await connection.query('SET LOCAL ROLE luminix_api')
  stage = 'runtime_guard'
  await assertRuntimeDatabaseSecurity(connection)
  stage = 'runtime_list'
  assert.equal((await domain('/auth/clinics')).json().clinics.length, 1)
  assert.equal((await domain(`/clinics/${clinicAId}/context`)).json().clinic.id, clinicAId)
  assert.equal((await domain(`/clinics/${clinicAId}/settings`)).statusCode, 200)
  assert.equal((await domain(`/clinics/${clinicBId}/context`)).statusCode, 403)
  await connection.query('RESET ROLE')
  const roleBId = (
    await connection.query(
      'SELECT role_id FROM luminix.clinic_memberships WHERE identity_id = $1 AND clinic_id = $2',
      [ownerBId, clinicBId],
    )
  ).rows[0].role_id
  await connection.query(
    'INSERT INTO luminix.clinic_memberships(clinic_id, identity_id, role_id) VALUES ($1, $2, $3)',
    [clinicBId, ownerAId, roleBId],
  )
  await connection.query('SET LOCAL ROLE luminix_api')
  assert.equal((await domain('/auth/clinics')).json().clinics.length, 2)
  assert.equal((await domain(`/clinics/${clinicBId}/context`)).json().clinic.id, clinicBId)
  assert.equal((await domain(`/clinics/${clinicBId}/settings`)).statusCode, 200)
  await connection.query('RESET ROLE')
  await connection.query(
    "UPDATE luminix.clinic_memberships SET status = 'revoked' WHERE clinic_id = $1 AND identity_id = $2",
    [clinicBId, ownerAId],
  )
  await connection.query('SET LOCAL ROLE luminix_api')
  assert.equal((await domain(`/clinics/${clinicBId}/context`)).statusCode, 403)
  assert.equal((await domain(`/clinics/${clinicAId}/context`)).statusCode, 200)
  await connection.query('RESET ROLE')
  console.log(
    'PASS: real HTTP with restricted runtime, same-token clinic switch, cross-access denial and membership revocation without reauthentication',
  )
  const testRole = `bootstrap_check_${randomUUID().replaceAll('-', '')}`
  const ownerRole = String(
    (await connection.query('SELECT current_user AS name')).rows[0].name,
  ).replaceAll('"', '""')
  await connection.query(`CREATE ROLE ${testRole} NOSUPERUSER NOBYPASSRLS NOLOGIN`)
  await connection.query(`GRANT ${testRole} TO "${ownerRole}"`)
  await connection.query(`GRANT USAGE ON SCHEMA luminix TO ${testRole}`)
  await connection.query(
    `GRANT SELECT ON luminix.clinics, luminix.clinic_memberships, luminix.clinic_settings TO ${testRole}`,
  )
  await connection.query(
    `GRANT EXECUTE ON FUNCTION luminix.bootstrap_owner_clinic(uuid, text) TO ${testRole}`,
  )
  await connection.query(`SET LOCAL ROLE ${testRole}`)
  try {
    const clinicB = (
      await connection.query('SELECT * FROM luminix.bootstrap_owner_clinic($1, $2)', [
        ownerBId,
        'Synthetic owner clinic B',
      ])
    ).rows[0]
    assert.notEqual(clinicB.clinic_id, clinicAId)
    await connection.query(
      "SELECT set_config('luminix.clinic_id', $1, true), set_config('luminix.identity_id', $2, true)",
      [clinicAId, ownerAId],
    )
    assert.equal(
      (await connection.query('SELECT clinic_id FROM luminix.clinic_settings')).rows.length,
      1,
    )
    assert.equal(
      (await connection.query('SELECT id FROM luminix.clinics WHERE id = $1', [clinicB.clinic_id]))
        .rows.length,
      0,
    )
    await connection.query(
      "SELECT set_config('luminix.clinic_id', $1, true), set_config('luminix.identity_id', $2, true)",
      [clinicB.clinic_id, ownerAId],
    )
    assert.equal(
      (
        await connection.query(
          "SELECT id FROM luminix.clinic_memberships WHERE identity_id = $1 AND clinic_id = $2 AND status = 'active'",
          [ownerAId, clinicB.clinic_id],
        )
      ).rows.length,
      0,
    )
  } finally {
    await connection.query('RESET ROLE')
    await connection.query(
      "SELECT set_config('luminix.clinic_id', '', true), set_config('luminix.identity_id', '', true)",
    )
  }
  assert.equal(
    (
      await connection.query(
        'SELECT id FROM luminix.audit_logs WHERE clinic_id = $1 AND actor_identity_id = $2',
        [clinicAId, ownerAId],
      )
    ).rows.length,
    13,
  )
  console.log(
    'PASS: atomic owner bootstrap, retry, audited actor, restricted EXECUTE and clinic A/B isolation',
  )
  assert.equal((await session(`${idToken}invalid`)).statusCode, 401)
  await connection.query(
    "UPDATE luminix.identities SET status = 'disabled' WHERE firebase_uid = $1",
    [uid],
  )
  assert.equal((await session()).statusCode, 403)
  await connection.query(
    "UPDATE luminix.identities SET status = 'active' WHERE firebase_uid = $1",
    [uid],
  )
  await auth.updateUser(uid, { disabled: true })
  assert.equal((await session()).statusCode, 401)
  await auth.updateUser(uid, { disabled: false })
  await new Promise((resolve) => setTimeout(resolve, 1500))
  await auth.revokeRefreshTokens(uid)
  assert.equal((await session()).statusCode, 401)
  console.log(
    'PASS: real password login, ID Token, stable identity, forged headers, malformed token, disabled identity/user and revoked old token',
  )
} catch (error) {
  // Do not print provider/REST errors, which may include credentials or token contents.
  console.error('FAIL: real session check did not complete; no provider details logged')
  const failure = error as { code?: string; actual?: unknown; expected?: unknown }
  console.error({
    stage,
    code: failure.code,
    actual: typeof failure.actual === 'number' ? failure.actual : undefined,
    expected: typeof failure.expected === 'number' ? failure.expected : undefined,
  })
  process.exitCode = 1
} finally {
  try {
    if (begun) await connection.query('ROLLBACK')
  } catch {
    discard = true
    process.exitCode = 1
    console.error('FAIL: rollback; connection discarded')
  }
  connection.release(discard || !begun)
  await app?.close()
  await pool.end()
  if (uid) {
    try {
      await auth.deleteUser(uid)
      console.log('Temporary Firebase user deleted; Neon identity transaction rolled back')
    } catch {
      process.exitCode = 1
      console.error('FAIL: temporary Firebase user cleanup required')
    }
  }
}
