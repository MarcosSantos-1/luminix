import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { buildApp } from '../src/app.js'
import { applyMigrations, type SqlConnection } from '../src/shared/database/migrations.js'

let db: PGlite
let database: SqlConnection
let app: Awaited<ReturnType<typeof buildApp>>
const verifyToken = vi.fn(async (token: string) => {
  if (
    ['expired', 'revoked', 'wrong-project', 'invalid-signature', 'disabled-firebase'].includes(
      token,
    )
  ) {
    throw new Error('Sensitive provider detail')
  }
  return { uid: token === 'a-old' ? 'a' : token }
})

beforeAll(async () => {
  db = new PGlite()
  database = {
    async query(sql, values) {
      if (values) return db.query(sql, values)
      const result = await db.exec(sql)
      return { rows: result.at(-1)?.rows ?? [] }
    },
  }
  await applyMigrations(database)
  app = await buildApp({}, { database, verifyToken })
})
afterAll(async () => {
  await app?.close()
  await db?.close()
})

function session(token?: string, headers: Record<string, string> = {}) {
  return app.inject({
    method: 'GET',
    url: '/auth/session',
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
  })
}

describe('staff session HTTP + database', () => {
  it('requires a bearer token and does not trust identity or clinic headers', async () => {
    const response = await session(undefined, { 'x-identity-id': 'a', 'x-clinic-id': 'b' })
    expect(response.statusCode).toBe(401)
    expect(verifyToken).not.toHaveBeenCalled()
  })

  it.each(['expired', 'revoked', 'wrong-project', 'invalid-signature', 'disabled-firebase'])(
    'rejects %s without creating an identity',
    async (token) => {
      const response = await session(token)
      expect(response.statusCode).toBe(401)
      expect(response.body).not.toContain('Sensitive')
      expect((await database.query('SELECT id FROM luminix.identities')).rows).toHaveLength(0)
    },
  )

  it('associates only verified UID, handles concurrent logins and keeps A separate from B', async () => {
    const responses = await Promise.all([session('a'), session('a'), session('a')])
    expect(responses.every((response) => response.statusCode === 200)).toBe(true)
    const identityA = responses[0].json().identity.id
    expect(responses.map((response) => response.json().identity.id)).toEqual([
      identityA,
      identityA,
      identityA,
    ])
    const responseB = await session('b', { 'x-identity-id': identityA, 'x-clinic-id': 'clinic-a' })
    expect(responseB.json().identity.id).not.toBe(identityA)
    expect(responseB.json()).toEqual({ identity: { id: expect.any(String) } })
    expect(responseB.headers['cache-control']).toBe('no-store')
    expect((await database.query('SELECT id FROM luminix.identities')).rows).toHaveLength(2)
    expect((await database.query('SELECT id FROM luminix.clinic_memberships')).rows).toHaveLength(0)
    expect((await database.query('SELECT id FROM luminix.clinics')).rows).toHaveLength(0)
  })

  it('does not reactivate disabled identities even with an older valid Firebase token', async () => {
    await database.query(
      "UPDATE luminix.identities SET status = 'disabled' WHERE firebase_uid = $1",
      ['a'],
    )
    expect((await session('a-old')).statusCode).toBe(403)
    expect((await session('a')).statusCode).toBe(403)
    expect((await session('b')).statusCode).toBe(200)
  })

  it('sanitizes database errors and fails closed', async () => {
    const failingApp = await buildApp(
      {},
      {
        verifyToken,
        database: {
          query: async () => {
            throw new Error('postgres credentials and SQL')
          },
        },
      },
    )
    try {
      const response = await failingApp.inject({
        url: '/auth/session',
        headers: { authorization: 'Bearer b' },
      })
      expect(response.statusCode).toBe(503)
      expect(response.body).not.toMatch(/postgres|credentials|SQL/)
    } finally {
      await failingApp.close()
    }
  })

  it('limits attempts before calling Firebase', async () => {
    const limitedApp = await buildApp({}, { database, verifyToken })
    try {
      for (let i = 0; i < 30; i++) await limitedApp.inject({ url: '/auth/session' })
      const before = verifyToken.mock.calls.length
      const response = await limitedApp.inject({
        url: '/auth/session',
        headers: { authorization: 'Bearer b' },
      })
      expect(response.statusCode).toBe(429)
      expect(verifyToken.mock.calls.length).toBe(before)
    } finally {
      await limitedApp.close()
    }
  })
})
