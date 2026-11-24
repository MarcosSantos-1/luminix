import type { FastifyInstance } from 'fastify'
import type { AuthDependencies } from '../../shared/auth/staff-session.js'
import { createOnlinePaymentsProvider, type OnlinePaymentsProvider } from './online-checkout.js'
import { refundDue } from './refunds.js'

/**
 * Connect webhook (ADR-040): events of the clinics' connected accounts. The signature is checked
 * on the raw body; only then the payment of a visit is confirmed or its hold released.
 */
export async function onlinePaymentRoutes(app: FastifyInstance, dependencies: AuthDependencies) {
  let provider: OnlinePaymentsProvider | null | undefined = dependencies.onlinePayments
  const payments = () => {
    if (provider === undefined) provider = createOnlinePaymentsProvider()
    return provider
  }
  await app.register(async (scope) => {
    scope.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer', bodyLimit: 262_144 },
      (_request, body, done) => done(null, body),
    )
    scope.post('/payments/stripe/webhook', async (request, reply) => {
      const stripe = payments()
      if (!stripe) return reply.code(503).send({ error: 'Payments unavailable' })
      const signature = request.headers['stripe-signature']
      if (typeof signature !== 'string' || !Buffer.isBuffer(request.body))
        return reply.code(400).send({ error: 'Invalid signature' })
      let event
      try {
        event = stripe.readEvent(request.body, signature)
      } catch {
        request.log.warn({ event: 'connect_webhook_signature_invalid' })
        return reply.code(400).send({ error: 'Invalid signature' })
      }
      if (!event) return { received: true }
      try {
        const result = await dependencies.database.query(
          'SELECT luminix.apply_connect_payment($1, $2, $3, $4, $5, $6) AS result',
          [event.id, event.type, event.account, event.session, event.intent, event.outcome],
        )
        const outcome = String(result.rows[0]?.result ?? '')
        // Money after the slot was released: give it back right away.
        if (outcome === 'paid_late') {
          request.log.warn({ event: 'online_payment_paid_late', type: event.type })
          const clinic = (
            await dependencies.database.query('SELECT luminix.online_payment_clinic($1) AS id', [
              event.session,
            ])
          ).rows[0]?.id
          if (clinic) await refundDue(dependencies.database, stripe, String(clinic), request.log)
        }
        return { received: true }
      } catch (error) {
        const code = (error as { code?: string }).code
        if (code === '22023' || code === '42501') {
          request.log.warn({ event: 'connect_webhook_rejected', type: event.type, code })
          return { received: true }
        }
        request.log.error({ event: 'connect_webhook_failed', type: event.type })
        return reply.code(500).send({ error: 'Payment event failed' })
      }
    })
  })
}
