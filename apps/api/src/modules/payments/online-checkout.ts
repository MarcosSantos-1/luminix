import type Stripe from 'stripe'
import { createStripeClient } from '../../shared/integrations/stripe/client.js'

// Client pays the visit in the app (ADR-040): Stripe Checkout created ON the clinic's connected
// account (direct charge). Luminix takes no fee; Stripe's fee is charged to the clinic.

export type OnlineMethod = 'pix' | 'card'

/** What a verified Connect webhook means for an online payment; anything else is ignored. */
export type ConnectPaymentEvent = {
  id: string
  type: string
  account: string
  session: string
  intent: string | null
  outcome: 'paid' | 'expired'
}

export class PixUnavailableError extends Error {
  constructor() {
    super('Pix unavailable')
  }
}

export interface OnlinePaymentsProvider {
  createCheckout(input: {
    account: string
    appointmentId: string
    clinicId: string
    method: OnlineMethod
    amountCents: number
    description: string
    /** The space's name: Checkout refuses connected accounts without a business name. */
    businessName: string
    email: string | null
    expiresAt: Date
    returnUrl: string
  }): Promise<{ id: string; url: string }>
  /** URL of a still open session (the client closed the payment page and comes back). */
  openUrl(account: string, session: string): Promise<string | null>
  readEvent(rawBody: Buffer, signature: string): ConnectPaymentEvent | null
  /** Full refund on the clinic's account; idempotent per payment. Returns the refund id. */
  refund(input: {
    account: string
    paymentId: string
    intent: string | null
    session: string
  }): Promise<string>
}

const intentId = (value: string | { id: string } | null | undefined) =>
  value ? (typeof value === 'string' ? value : value.id) : null

const shared = new WeakMap<object, OnlinePaymentsProvider | null>()
/** One provider per app: the injected one (tests), or Stripe from the environment. */
export function onlinePaymentsOf(dependencies: { onlinePayments?: OnlinePaymentsProvider | null }) {
  if (dependencies.onlinePayments !== undefined) return dependencies.onlinePayments
  if (!shared.has(dependencies)) shared.set(dependencies, createOnlinePaymentsProvider())
  return shared.get(dependencies) ?? null
}

/** Stripe in test mode for Connect, or null while the Connect webhook secret is missing. */
export function createOnlinePaymentsProvider(
  environment: NodeJS.ProcessEnv = process.env,
): OnlinePaymentsProvider | null {
  const webhookSecret = environment.STRIPE_CONNECT_WEBHOOK_SECRET
  if (!environment.STRIPE_SECRET_KEY?.startsWith('sk_test_') || !webhookSecret) return null
  const stripe = createStripeClient(environment)
  type CheckoutInput = Parameters<OnlinePaymentsProvider['createCheckout']>[0]
  const pixError = (input: CheckoutInput, error: unknown) =>
    input.method === 'pix' && /pix/i.test((error as Error)?.message ?? '')

  return {
    async createCheckout(input) {
      try {
        return await open(input)
      } catch (error) {
        // Accounts onboarded without a public name: give them the space's name, try once more.
        const named = /business name|account name/i.test((error as Error)?.message ?? '')
        if (named && input.businessName.trim()) {
          await stripe.v2.core.accounts.update(input.account, {
            display_name: input.businessName.trim().slice(0, 100),
          })
          try {
            return await open(input)
          } catch (retry) {
            if (pixError(input, retry)) throw new PixUnavailableError()
            throw retry
          }
        }
        if (pixError(input, error)) throw new PixUnavailableError()
        throw error
      }
    },
    async openUrl(account, sessionId) {
      const session = await stripe.checkout.sessions.retrieve(
        sessionId,
        {},
        { stripeAccount: account },
      )
      return session.status === 'open' ? session.url : null
    },
    readEvent: (rawBody, signature) => readEvent(rawBody, signature),
    async refund({ account, paymentId, intent, session }) {
      let paymentIntent = intent
      if (!paymentIntent) {
        const found = await stripe.checkout.sessions.retrieve(
          session,
          {},
          { stripeAccount: account },
        )
        paymentIntent = intentId(found.payment_intent)
      }
      if (!paymentIntent) throw new Error('Payment without intent')
      const refund = await stripe.refunds.create(
        { payment_intent: paymentIntent, metadata: { luminix_payment_id: paymentId } },
        { stripeAccount: account, idempotencyKey: `luminix-refund-${paymentId}` },
      )
      return refund.id
    },
  }

  async function open(input: CheckoutInput) {
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        locale: 'pt-BR',
        payment_method_types: [input.method === 'pix' ? 'pix' : 'card'],
        ...(input.method === 'pix'
          ? {
              payment_method_options: {
                pix: {
                  expires_after_seconds: Math.max(
                    600,
                    Math.floor((input.expiresAt.getTime() - Date.now()) / 1000),
                  ),
                },
              },
            }
          : {}),
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'brl',
              unit_amount: input.amountCents,
              product_data: { name: input.description.slice(0, 120) },
            },
          },
        ],
        ...(input.email ? { customer_email: input.email } : {}),
        client_reference_id: input.appointmentId,
        expires_at: Math.floor(input.expiresAt.getTime() / 1000),
        success_url: `${input.returnUrl}?pagamento=ok`,
        cancel_url: `${input.returnUrl}?pagamento=cancelado`,
        metadata: {
          luminix_clinic_id: input.clinicId,
          luminix_appointment_id: input.appointmentId,
        },
        payment_intent_data: {
          metadata: {
            luminix_clinic_id: input.clinicId,
            luminix_appointment_id: input.appointmentId,
          },
        },
      },
      {
        stripeAccount: input.account,
        idempotencyKey: `luminix-visit-${input.appointmentId}-${input.method}`,
      },
    )
    if (!session.url) throw new Error('Checkout without URL')
    return { id: session.id, url: session.url }
  }

  function readEvent(rawBody: Buffer, signature: string): ConnectPaymentEvent | null {
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret!)
    if (!event.account) return null
    const paid =
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    const expired =
      event.type === 'checkout.session.expired' ||
      event.type === 'checkout.session.async_payment_failed'
    if (!paid && !expired) return null
    const session = event.data.object as Stripe.Checkout.Session
    if (!session.metadata?.luminix_appointment_id) return null
    // Pix finishes the checkout first and pays later (async): only "paid" counts.
    if (paid && session.payment_status !== 'paid') return null
    return {
      id: event.id,
      type: event.type,
      account: event.account,
      session: session.id,
      intent: intentId(session.payment_intent),
      outcome: paid ? 'paid' : 'expired',
    }
  }
}
