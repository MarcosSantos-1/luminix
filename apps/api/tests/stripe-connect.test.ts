import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../src/app.js'
import { applyMigrations, type SqlConnection } from '../src/shared/database/migrations.js'
import {
  accountStatus,
  createConnectProvider,
  type ConnectProvider,
} from '../src/modules/payments/stripe-connect.js'
import type Stripe from 'stripe'

let db: PGlite
let database: SqlConnection
let app: Awaited<ReturnType<typeof buildApp>>
let a: string
let b: string
let ownerA: string
const create = vi.fn(async () => 'acct_clinicA')
const session = vi.fn(async () => 'secret_test_session')
const provider: ConnectProvider = {
  context: vi.fn(async () => ({
    platformAccountId: 'acct_platform',
    livemode: false,
    publishableKey: 'pk_test_fixture',
  })),
  create,
  session,
  status: vi.fn(async () => ({
    state: 'pending' as const,
    chargesEnabled: false,
    payoutsEnabled: false,
    requirementsDue: 2,
    testMode: true,
  })),
}
beforeAll(async () => {
  db = new PGlite()
  database = {
    async query(sql, values) {
      if (values) return db.query(sql, values)
      return { rows: (await db.exec(sql)).at(-1)?.rows ?? [] }
    },
  }
  await applyMigrations(database)
  const clinics: string[] = []
  for (const uid of ['a', 'b']) {
    const identity = String(
      (await database.query('SELECT * FROM luminix.resolve_staff_identity($1)', [uid])).rows[0]
        .identity_id,
    )
    if (uid === 'a') ownerA = identity
    clinics.push(
      String(
        (
          await database.query('SELECT * FROM luminix.bootstrap_owner_clinic($1,$2)', [
            identity,
            `Clínica ${uid}`,
          ])
        ).rows[0].clinic_id,
      ),
    )
  }
  ;[a, b] = clinics
  await db.exec('SET ROLE luminix_api')
  app = await buildApp(
    {},
    {
      database,
      tenantPool: { connect: async () => ({ ...database, release() {} }) },
      verifyToken: async (token) => ({ uid: token }),
      connectProvider: provider,
    },
  )
})
afterAll(async () => {
  await app?.close()
  await db?.close()
})
const get = (clinic = a, uid = 'a') =>
  app.inject({
    url: `/clinics/${clinic}/payments/connect`,
    headers: { authorization: `Bearer ${uid}` },
  })
const post = (purpose = 'onboarding', clinic = a, uid = 'a', extra = {}) =>
  app.inject({
    method: 'POST',
    url: `/clinics/${clinic}/payments/connect/session`,
    headers: { authorization: `Bearer ${uid}` },
    payload: { purpose, ...extra },
  })
async function owner(work: () => Promise<void>) {
  await db.exec('RESET ROLE')
  try {
    await work()
  } finally {
    await db.exec('SET ROLE luminix_api')
  }
}

describe('Stripe Connect with restricted database role', () => {
  it('does not create an account for reading or outside-app preferences', async () => {
    const response = await get()
    expect(response.statusCode).toBe(200)
    expect(response.json().status.state).toBe('not_started')
    expect(response.headers['cache-control']).toBe('no-store')
    expect(create).not.toHaveBeenCalled()
    expect((await post('payments')).statusCode).toBe(409)
  })
  it('denies cross-tenant access before any provider call and rejects injected account IDs', async () => {
    const calls = vi.mocked(provider.context).mock.calls.length
    expect((await get(b)).statusCode).toBe(403)
    expect((await post('onboarding', b)).statusCode).toBe(403)
    expect(vi.mocked(provider.context).mock.calls.length).toBe(calls)
    expect((await post('onboarding', a, 'a', { accountId: 'acct_other' })).statusCode).toBe(400)
    expect((await app.inject({ url: `/clinics/${a}/payments/connect` })).statusCode).toBe(401)
  })
  it('retries an uncertain creation with the same persisted key and sanitized errors', async () => {
    create.mockRejectedValueOnce(new Error('sk_test_private secret SQL'))
    const failed = await post()
    expect(failed.statusCode).toBe(503)
    expect(failed.body).not.toMatch(/sk_test_private|SQL/)
    const success = await post()
    expect(success.statusCode).toBe(200)
    expect(success.json().clientSecret).toBe('secret_test_session')
    expect(success.headers['cache-control']).toBe('no-store')
    expect(create.mock.calls[0]).toEqual(create.mock.calls[1])
    expect(create.mock.calls[0]).toEqual([a, expect.any(String)])
    expect((await post()).statusCode).toBe(200)
    expect(create).toHaveBeenCalledTimes(2)
    expect(session).toHaveBeenLastCalledWith('acct_clinicA', 'onboarding')
    expect((await database.query('SELECT * FROM luminix.stripe_connect_accounts')).rows).toEqual([])
    await expect(
      database.query('DELETE FROM luminix.stripe_connect_accounts'),
    ).rejects.toMatchObject({ code: '42501' })
  })
  it('uses live provider status and allows each component only for the authorized account', async () => {
    expect((await get()).json().status.state).toBe('pending')
    expect(provider.status).toHaveBeenCalledWith('acct_clinicA')
    for (const purpose of ['management', 'payments', 'payouts']) {
      expect((await post(purpose)).statusCode).toBe(200)
      expect(session).toHaveBeenLastCalledWith('acct_clinicA', purpose)
    }
    expect((await get(b, 'b')).json().status.state).toBe('not_started')
  })
  it('refuses recreation after Stripe idempotency retention and audits bindings without secrets', async () => {
    await owner(async () => {
      await database.query(
        "INSERT INTO luminix.stripe_connect_accounts(clinic_id, platform_account_id, creation_started_at) VALUES ($1,'acct_platform', now() - interval '25 hours')",
        [b],
      )
      const audit = await database.query(
        "SELECT changed_fields FROM luminix.audit_logs WHERE entity_table = 'stripe_connect_accounts' AND clinic_id = $1",
        [a],
      )
      expect(audit.rows.length).toBeGreaterThan(0)
      expect(JSON.stringify(audit.rows)).not.toContain('secret_test_session')
    })
    expect((await post('onboarding', b, 'b')).statusCode).toBe(409)
    expect(create).not.toHaveBeenCalled()
  })
  it('denies a removed settings grant even when clinic membership remains active', async () => {
    const calls = vi.mocked(provider.context).mock.calls.length
    await owner(async () => {
      await database.query(
        "DELETE FROM luminix.role_permissions WHERE clinic_id = $1 AND permission_code = 'settings:manage'",
        [a],
      )
    })
    expect((await get()).statusCode).toBe(403)
    expect((await post()).statusCode).toBe(403)
    expect(vi.mocked(provider.context).mock.calls.length).toBe(calls)
    await owner(async () => {
      await database.query(
        "INSERT INTO luminix.role_permissions(clinic_id, role_id, permission_code) SELECT clinic_id, id, 'settings:manage' FROM luminix.roles WHERE clinic_id = $1 AND name = 'owner'",
        [a],
      )
    })
  })
  it('revalidates membership and grants after a provider call before returning a secret', async () => {
    session.mockImplementationOnce(async () => {
      await owner(async () => {
        await database.query(
          "UPDATE luminix.clinic_memberships SET status = 'revoked' WHERE clinic_id = $1 AND identity_id = $2",
          [a, ownerA],
        )
      })
      return 'must_not_be_returned'
    })
    const response = await post()
    expect(response.statusCode).toBe(403)
    expect(response.body).not.toContain('must_not_be_returned')
    expect((await get()).statusCode).toBe(403)
  })
})

describe('Stripe Connect status and configuration', () => {
  it('requires both charges and payouts to classify an account as active', () => {
    const account = {
      livemode: false,
      configuration: {
        merchant: {
          capabilities: {
            card_payments: { status: 'active' },
            stripe_balance: { payouts: { status: 'restricted' } },
          },
        },
      },
      requirements: { entries: [{ minimum_deadline: { status: 'past_due' } }] },
    } as unknown as Stripe.V2.Core.Account
    expect(accountStatus(account)).toMatchObject({ state: 'restricted', requirementsDue: 1 })
    account.configuration!.merchant!.capabilities!.stripe_balance!.payouts!.status = 'active'
    expect(accountStatus(account)).toMatchObject({ state: 'active' })
    expect(accountStatus({ ...account, closed: true })).toMatchObject({
      state: 'restricted',
      chargesEnabled: false,
      payoutsEnabled: false,
    })
  })
  it('refuses live or missing keys even in production during preparation', () => {
    expect(() =>
      createConnectProvider({
        NODE_ENV: 'production',
        STRIPE_SECRET_KEY: 'sk_live_fake',
        STRIPE_PUBLISHABLE_KEY: 'pk_live_fake',
      }),
    ).toThrow()
    expect(() => createConnectProvider({ STRIPE_SECRET_KEY: 'sk_test_fake' })).toThrow()
  })
})
