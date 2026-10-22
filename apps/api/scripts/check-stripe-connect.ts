import { loadEnvFile } from 'node:process'
import { randomUUID } from 'node:crypto'
import { createConnectProvider } from '../src/modules/payments/stripe-connect.js'
import { createStripeClient } from '../src/shared/integrations/stripe/client.js'

loadEnvFile('.env')
if (!process.argv.includes('--allow-test-account')) throw new Error('Requires --allow-test-account')
const provider = createConnectProvider()
const context = await provider.context()
if (context.livemode || context.platformAccountId !== 'acct_1UBfvrCz54koiZqR')
  throw new Error('Unexpected Stripe destination')
console.log(`Stripe Connect destination: ${context.platformAccountId} (test)`)
let accountId: string | undefined
try {
  accountId = await provider.create(randomUUID(), randomUUID())
  const status = await provider.status(accountId)
  console.log(`Synthetic connected account ${accountId} created; state: ${status.state}`)
  for (const purpose of ['onboarding', 'management', 'payments', 'payouts'] as const) {
    const secret = await provider.session(accountId, purpose)
    if (!secret) throw new Error('Missing session')
    console.log(`Embedded ${purpose}: session created (secret omitted)`)
  }
} catch (error) {
  const safe = error as { type?: string; code?: string; param?: string; message?: string }
  console.error({
    type: safe.type,
    code: safe.code,
    param: safe.param,
    message: safe.message?.replace(/(?:sk|pk|rk)_(?:test|live)_[A-Za-z0-9]+/g, '[redacted]'),
  })
  process.exitCode = 1
} finally {
  if (accountId) {
    try {
      const result = await createStripeClient().v2.core.accounts.close(accountId, {
        applied_configurations: ['merchant'],
      })
      console.log(`Synthetic account closed: ${result.closed}`)
    } catch {
      console.error(`Synthetic account cleanup failed: ${accountId}`)
      process.exitCode = 1
    }
  }
}
