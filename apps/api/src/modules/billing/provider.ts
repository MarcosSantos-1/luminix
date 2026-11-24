import Stripe from 'stripe'
import { createStripeClient } from '../../shared/integrations/stripe/client.js'

// Luminix subscription (ADR-039): the clinic pays Luminix. Separate from Stripe Connect, where
// the clinic receives from its own clients (ADR-016).

export type Plan = 'monthly' | 'annual'
export type Method = 'card' | 'pix'

/** Prices shown and charged. Card prices live in Stripe (price IDs); Pix uses these amounts. */
export const plans: Record<Plan, { label: string; cents: number; months: number }> = {
  monthly: { label: 'Mensal', cents: 9_990, months: 1 },
  annual: { label: 'Anual', cents: 90_000, months: 12 },
}

/** What a verified Stripe webhook means for a clinic; anything else is ignored. */
export type BillingEvent = {
  id: string
  type: string
  clinicId: string
  kind: 'pix_paid' | 'card_period' | 'card_canceled'
  plan: Plan | null
  cardStatus: 'active' | 'past_due' | 'canceled' | 'incomplete' | null
  periodEnd: Date | null
  cancelAtPeriodEnd: boolean
  customer: string | null
  subscription: string | null
}

export interface BillingProvider {
  createCustomer(input: { clinicId: string; name: string; email: string | null }): Promise<string>
  createCheckout(input: {
    clinicId: string
    customer: string
    plan: Plan
    method: Method
    returnUrl: string
  }): Promise<string>
  createPortal(input: { customer: string; returnUrl: string }): Promise<string>
  /** Verifies the signature and maps the event; null when it does not concern a subscription. */
  readEvent(rawBody: Buffer, signature: string): BillingEvent | null
}

const statusOf = (status: string): BillingEvent['cardStatus'] =>
  status === 'active' || status === 'trialing'
    ? 'active'
    : status === 'past_due' || status === 'unpaid'
      ? 'past_due'
      : status === 'canceled' || status === 'incomplete_expired'
        ? 'canceled'
        : 'incomplete'

const planOf = (value: unknown): Plan | null =>
  value === 'monthly' || value === 'annual' ? value : null

const id = (value: string | { id: string } | null | undefined) =>
  value ? (typeof value === 'string' ? value : value.id) : null

/**
 * Stripe Billing from the environment, or null when it is not configured yet (the plan page
 * then says online payment is not available). Card prices must be recurring BRL prices.
 */
export function createStripeBillingProvider(
  environment: NodeJS.ProcessEnv = process.env,
): BillingProvider | null {
  const monthly = environment.STRIPE_BILLING_PRICE_MONTHLY
  const annual = environment.STRIPE_BILLING_PRICE_ANNUAL
  const webhookSecret = environment.STRIPE_BILLING_WEBHOOK_SECRET
  if (!environment.STRIPE_SECRET_KEY || !monthly || !annual || !webhookSecret) return null
  const stripe = createStripeClient(environment)
  const prices: Record<Plan, string> = { monthly, annual }

  return {
    async createCustomer({ clinicId, name, email }) {
      const customer = await stripe.customers.create(
        { name, ...(email ? { email } : {}), metadata: { luminix_clinic_id: clinicId } },
        { idempotencyKey: `luminix-billing-customer-${clinicId}` },
      )
      return customer.id
    },
    async createCheckout({ clinicId, customer, plan, method, returnUrl }) {
      const common = {
        customer,
        client_reference_id: clinicId,
        locale: 'pt-BR' as const,
        success_url: `${returnUrl}?assinatura=ok`,
        cancel_url: `${returnUrl}?assinatura=cancelada`,
        metadata: { luminix_clinic_id: clinicId, luminix_plan: plan },
      }
      const session =
        method === 'card'
          ? await stripe.checkout.sessions.create({
              ...common,
              mode: 'subscription',
              line_items: [{ price: prices[plan], quantity: 1 }],
              subscription_data: {
                metadata: { luminix_clinic_id: clinicId, luminix_plan: plan },
              },
            })
          : await stripe.checkout.sessions.create({
              ...common,
              mode: 'payment',
              payment_method_types: ['pix'],
              line_items: [
                {
                  quantity: 1,
                  price_data: {
                    currency: 'brl',
                    unit_amount: plans[plan].cents,
                    product_data: { name: `Luminix — plano ${plans[plan].label.toLowerCase()}` },
                  },
                },
              ],
            })
      if (!session.url) throw new Error('Checkout without URL')
      return session.url
    },
    async createPortal({ customer, returnUrl }) {
      const session = await stripe.billingPortal.sessions.create({
        customer,
        return_url: returnUrl,
        locale: 'pt-BR',
      })
      return session.url
    },
    readEvent(rawBody, signature) {
      const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
      const base = { id: event.id, type: event.type }
      if (
        event.type === 'checkout.session.completed' ||
        event.type === 'checkout.session.async_payment_succeeded'
      ) {
        const session = event.data.object as Stripe.Checkout.Session
        // Only the Pix one-off payment extends access here; card checkouts arrive as
        // subscription events. Pix confirms later (async), so "completed" may still be unpaid.
        if (session.mode !== 'payment' || session.payment_status !== 'paid') return null
        const clinicId = session.metadata?.luminix_clinic_id ?? session.client_reference_id
        const plan = planOf(session.metadata?.luminix_plan)
        if (!clinicId || !plan) return null
        return {
          ...base,
          clinicId,
          kind: 'pix_paid',
          plan,
          cardStatus: null,
          periodEnd: null,
          cancelAtPeriodEnd: false,
          customer: id(session.customer),
          subscription: null,
        }
      }
      if (
        event.type === 'customer.subscription.created' ||
        event.type === 'customer.subscription.updated' ||
        event.type === 'customer.subscription.deleted'
      ) {
        const subscription = event.data.object as Stripe.Subscription
        const clinicId = subscription.metadata?.luminix_clinic_id
        if (!clinicId) return null
        const item = subscription.items.data[0]
        const periodEnd = item?.current_period_end ? new Date(item.current_period_end * 1000) : null
        const deleted = event.type === 'customer.subscription.deleted'
        return {
          ...base,
          clinicId,
          kind: deleted ? 'card_canceled' : 'card_period',
          plan: planOf(subscription.metadata?.luminix_plan),
          cardStatus: deleted ? 'canceled' : statusOf(subscription.status),
          periodEnd,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          customer: id(subscription.customer),
          subscription: subscription.id,
        }
      }
      return null
    },
  }
}
