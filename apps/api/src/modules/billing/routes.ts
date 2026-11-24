import type { FastifyInstance } from 'fastify'
import type { AuthDependencies } from '../../shared/auth/staff-session.js'
import type { SqlConnection } from '../../shared/database/migrations.js'
import { clinicRefParams, createAuthorizedRoute } from '../../shared/tenant/authorized-route.js'
import type { Authenticate } from '../../shared/tenant/authorized-route.js'
import {
  createStripeBillingProvider,
  plans,
  type BillingProvider,
  type Method,
  type Plan,
} from './provider.js'

// Luminix subscription (ADR-039). The state always comes from the database
// (`clinic_access_state`); Stripe is only called to open checkout/portal and its signed
// webhooks are the only way a payment changes access.

export async function readAccessState(connection: SqlConnection, clinicId: string) {
  const result = await connection.query('SELECT luminix.clinic_access_state($1::uuid) AS state', [
    clinicId,
  ])
  return (result.rows[0]?.state ?? null) as Record<string, unknown> | null
}

function adminReturnUrl(adminOrigin: string | undefined, clinicId: string) {
  const fallback = process.env.NODE_ENV !== 'production' ? 'http://localhost:3000' : undefined
  const raw = adminOrigin || fallback
  if (!raw) return null
  try {
    const url = new URL(raw)
    const local = url.hostname === 'localhost' && process.env.NODE_ENV !== 'production'
    return url.protocol === 'https:' || local ? `${url.origin}/c/${clinicId}` : null
  } catch {
    return null
  }
}

export async function billingRoutes(
  app: FastifyInstance,
  authenticate: Authenticate,
  dependencies: AuthDependencies,
) {
  const authorized = createAuthorizedRoute(authenticate, dependencies.tenantPool)
  let provider: BillingProvider | null | undefined = dependencies.billingProvider
  const billing = () => {
    if (provider === undefined) provider = createStripeBillingProvider()
    return provider
  }

  app.get<{ Params: { clinicId: string } }>(
    '/clinics/:clinicId/billing',
    { schema: { params: clinicRefParams } },
    async (request, reply) =>
      authorized(request, reply, null, async (connection, tenant) => ({
        access: await readAccessState(connection, tenant.clinicId),
        plans: Object.entries(plans).map(([id, plan]) => ({ id, ...plan })),
        methods: ['card', 'pix'],
        // Online payment opens once Stripe Billing is configured on the server.
        available: Boolean(billing()),
      })),
  )

  app.post<{ Params: { clinicId: string }; Body: { plan: Plan; method: Method } }>(
    '/clinics/:clinicId/billing/checkout',
    {
      bodyLimit: 512,
      schema: {
        params: clinicRefParams,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['plan', 'method'],
          properties: {
            plan: { type: 'string', enum: ['monthly', 'annual'] },
            method: { type: 'string', enum: ['card', 'pix'] },
          },
        },
      },
    },
    async (request, reply) => {
      const stripe = billing()
      if (!stripe) return reply.code(503).send({ error: 'Billing unavailable' })
      // 1) Who is paying and for which clinic, inside the tenant transaction.
      const context = (await authorized(
        request,
        reply,
        'settings:manage',
        async (connection, tenant) => {
          const row = (
            await connection.query(
              `SELECT c.name, p.contact_email, s.stripe_customer_id, s.card_status
               FROM luminix.clinics c
               LEFT JOIN luminix.clinic_profiles p ON p.clinic_id = c.id
               LEFT JOIN luminix.clinic_subscriptions s ON s.clinic_id = c.id
              WHERE c.id = $1`,
              [tenant.clinicId],
            )
          ).rows[0]
          return {
            clinicId: tenant.clinicId,
            name: String(row?.name ?? 'Espaço Luminix'),
            email: row?.contact_email ? String(row.contact_email) : null,
            customer: row?.stripe_customer_id ? String(row.stripe_customer_id) : null,
            cardActive: row?.card_status === 'active' || row?.card_status === 'past_due',
          }
        },
      )) as
        | {
            clinicId: string
            name: string
            email: string | null
            customer: string | null
            cardActive: boolean
          }
        | undefined
      if (reply.sent || !context) return
      if (request.body.method === 'card' && context.cardActive)
        return reply.code(409).send({ error: 'Subscription already active' })
      const returnUrl = adminReturnUrl(dependencies.adminOrigin, context.clinicId)
      if (!returnUrl) return reply.code(503).send({ error: 'Billing unavailable' })
      try {
        // 2) Stripe outside any SQL transaction; the customer is idempotent per clinic.
        let customer = context.customer
        if (!customer) {
          customer = await stripe.createCustomer(context)
          const saved = await authorized(
            request,
            reply,
            'settings:manage',
            async (connection, tenant) => {
              await connection.query('SELECT luminix.staff_set_billing_customer($1::uuid, $2)', [
                tenant.clinicId,
                customer,
              ])
              return true
            },
          )
          if (reply.sent || !saved) return
        }
        const url = await stripe.createCheckout({
          clinicId: context.clinicId,
          customer,
          plan: request.body.plan,
          method: request.body.method,
          returnUrl,
        })
        reply.header('Cache-Control', 'no-store')
        return { url }
      } catch {
        request.log.warn({ event: 'billing_checkout_unavailable' })
        return reply.code(503).send({ error: 'Billing unavailable' })
      }
    },
  )

  // Card customers manage their card, invoices and cancellation in the Stripe portal.
  app.post<{ Params: { clinicId: string } }>(
    '/clinics/:clinicId/billing/portal',
    { bodyLimit: 64, schema: { params: clinicRefParams } },
    async (request, reply) => {
      const stripe = billing()
      if (!stripe) return reply.code(503).send({ error: 'Billing unavailable' })
      const context = (await authorized(
        request,
        reply,
        'settings:manage',
        async (connection, tenant) => {
          const row = (
            await connection.query(
              'SELECT stripe_customer_id FROM luminix.clinic_subscriptions WHERE clinic_id = $1',
              [tenant.clinicId],
            )
          ).rows[0]
          return {
            clinicId: tenant.clinicId,
            customer: row?.stripe_customer_id ? String(row.stripe_customer_id) : null,
          }
        },
      )) as { clinicId: string; customer: string | null } | undefined
      if (reply.sent || !context) return
      if (!context.customer) return reply.code(409).send({ error: 'No billing customer' })
      const returnUrl = adminReturnUrl(dependencies.adminOrigin, context.clinicId)
      if (!returnUrl) return reply.code(503).send({ error: 'Billing unavailable' })
      try {
        reply.header('Cache-Control', 'no-store')
        return { url: await stripe.createPortal({ customer: context.customer, returnUrl }) }
      } catch {
        request.log.warn({ event: 'billing_portal_unavailable' })
        return reply.code(503).send({ error: 'Billing unavailable' })
      }
    },
  )

  // Signed Stripe webhooks: the raw body is needed to check the signature.
  await app.register(async (scope) => {
    scope.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer', bodyLimit: 262_144 },
      (_request, body, done) => done(null, body),
    )
    scope.post('/billing/stripe/webhook', async (request, reply) => {
      const stripe = billing()
      if (!stripe) return reply.code(503).send({ error: 'Billing unavailable' })
      const signature = request.headers['stripe-signature']
      if (typeof signature !== 'string' || !Buffer.isBuffer(request.body))
        return reply.code(400).send({ error: 'Invalid signature' })
      let event
      try {
        event = stripe.readEvent(request.body, signature)
      } catch {
        request.log.warn({ event: 'billing_webhook_signature_invalid' })
        return reply.code(400).send({ error: 'Invalid signature' })
      }
      if (!event) return { received: true }
      try {
        await dependencies.database.query(
          `SELECT luminix.apply_billing_event($1, $2, $3::uuid, $4, $5, $6, $7, $8, $9, $10) AS applied`,
          [
            event.id,
            event.type,
            event.clinicId,
            event.kind,
            event.plan,
            event.cardStatus,
            event.periodEnd,
            event.cancelAtPeriodEnd,
            event.customer,
            event.subscription,
          ],
        )
        return { received: true }
      } catch (error) {
        const code = (error as { code?: string }).code
        // Unknown clinic, malformed id or a customer of another clinic: never retried.
        if (code === 'P0002' || code === '22023' || code === '22P02' || code === '42501') {
          request.log.warn({ event: 'billing_webhook_rejected', type: event.type, code })
          return { received: true }
        }
        request.log.error({ event: 'billing_webhook_failed', type: event.type })
        return reply.code(500).send({ error: 'Billing event failed' })
      }
    })
  })
}
