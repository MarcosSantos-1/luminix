import type Stripe from 'stripe'
import { createStripeClient } from '../../shared/integrations/stripe/client.js'

export type ConnectPurpose = 'onboarding' | 'management' | 'payments' | 'payouts'
export type ConnectStatus = {
  state: 'not_started' | 'pending' | 'active' | 'restricted' | 'reviewing'
  chargesEnabled: boolean
  payoutsEnabled: boolean
  requirementsDue: number
  testMode: boolean
}
export interface ConnectProvider {
  context(): Promise<{ platformAccountId: string; livemode: boolean; publishableKey: string }>
  create(clinicId: string, creationKey: string): Promise<string>
  status(accountId: string): Promise<ConnectStatus>
  session(accountId: string, purpose: ConnectPurpose): Promise<string>
}

function openStripeReview(details: Array<{ code: string; resolution: string }>): boolean {
  return (
    details.length > 0 &&
    details.every(
      (detail) =>
        detail.code === 'requirements_pending_verification' && detail.resolution === 'no_resolution',
    )
  )
}

export function accountStatus(account: Stripe.V2.Core.Account): ConnectStatus {
  const capabilities = account.configuration?.merchant?.capabilities
  const cardPayments = capabilities?.card_payments
  const payoutsCapability = capabilities?.stripe_balance?.payouts
  const charges = cardPayments?.status
  const payouts = payoutsCapability?.status
  const due = (account.requirements?.entries ?? []).filter((entry) => {
    const deadline = entry.minimum_deadline?.status
    // A Stripe-owned review is not a form field the clinic can submit.
    return (
      (deadline === 'currently_due' || deadline === 'past_due') &&
      entry.awaiting_action_from !== 'stripe'
    )
  })
  const active = !account.closed && charges === 'active' && payouts === 'active'
  const restricted =
    account.closed ||
    [charges, payouts].some((status) => status === 'restricted' || status === 'unsupported')
  const reviewDetails = [
    ...(charges === 'active' ? [] : (cardPayments?.status_details ?? [])),
    ...(payouts === 'active' ? [] : (payoutsCapability?.status_details ?? [])),
  ]
  const reviewing =
    !active &&
    !restricted &&
    due.length === 0 &&
    [charges, payouts].every((status) => status === 'active' || status === 'pending') &&
    openStripeReview(reviewDetails)
  return {
    state: active ? 'active' : restricted ? 'restricted' : reviewing ? 'reviewing' : 'pending',
    chargesEnabled: !account.closed && charges === 'active',
    payoutsEnabled: !account.closed && payouts === 'active',
    requirementsDue: due.length,
    testMode: !account.livemode,
  }
}

export function connectReady(status: ConnectStatus): boolean {
  if (status.requirementsDue !== 0) return false
  if (status.state === 'active' && status.chargesEnabled && status.payoutsEnabled) return true
  // Live onboarding is unavailable. A test review with nothing left to submit does not finish.
  return status.testMode && status.state === 'reviewing'
}

export function createConnectProvider(environment = process.env): ConnectProvider {
  // Live onboarding requires a separate launch review; NODE_ENV production is not live money.
  if (
    !environment.STRIPE_SECRET_KEY?.startsWith('sk_test_') ||
    !environment.STRIPE_PUBLISHABLE_KEY?.startsWith('pk_test_')
  ) {
    throw new Error('Connect test configuration unavailable')
  }
  const stripe = createStripeClient(environment)
  const publishableKey = environment.STRIPE_PUBLISHABLE_KEY
  let platform: Promise<string> | undefined
  return {
    async context() {
      platform ??= stripe.accounts
        .retrieve(null, {}, { timeout: 8_000, maxNetworkRetries: 0 })
        .then((account) => account.id)
        .catch((error) => {
          platform = undefined
          throw error
        })
      return { platformAccountId: await platform, livemode: false, publishableKey }
    },
    async create(clinicId, creationKey) {
      // Stable body on retries: mutable draft fields must never change an idempotent request.
      const account = await stripe.v2.core.accounts.create(
        {
          identity: { country: 'br' },
          dashboard: 'full',
          defaults: {
            currency: 'brl',
            locales: ['pt-BR'],
            responsibilities: { fees_collector: 'stripe', losses_collector: 'stripe' },
          },
          configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
          metadata: { luminix_clinic_id: clinicId },
        },
        { idempotencyKey: `luminix-connect-${creationKey}`, timeout: 8_000, maxNetworkRetries: 0 },
      )
      return account.id
    },
    async status(accountId) {
      return accountStatus(
        await stripe.v2.core.accounts.retrieve(
          accountId,
          { include: ['configuration.merchant', 'requirements'] },
          { timeout: 8_000, maxNetworkRetries: 0 },
        ),
      )
    },
    async session(accountId, purpose) {
      const components: Stripe.AccountSessionCreateParams.Components =
        purpose === 'onboarding'
          ? { account_onboarding: { enabled: true } }
          : purpose === 'management'
            ? { account_management: { enabled: true } }
            : purpose === 'payments'
              ? {
                  payments: {
                    enabled: true,
                    features: {
                      refund_management: true,
                      dispute_management: true,
                    },
                  },
                }
              : { payouts: { enabled: true } }
      const session = await stripe.accountSessions.create(
        { account: accountId, components },
        { timeout: 8_000, maxNetworkRetries: 0 },
      )
      return session.client_secret
    },
  }
}
