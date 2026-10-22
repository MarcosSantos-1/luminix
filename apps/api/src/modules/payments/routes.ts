import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { createStaffAuthenticator } from '../../shared/auth/staff-session.js'
import { withClinicTransaction, type TenantPool } from '../../shared/tenant/clinic-transaction.js'
import {
  createConnectProvider,
  type ConnectProvider,
  type ConnectPurpose,
} from './stripe-connect.js'

type Request = FastifyRequest<{ Params: { clinicId: string }; Body?: { purpose: ConnectPurpose } }>
type Binding = {
  account_id: string | null
  creation_key: string
  creation_started_at: Date | string
}

export async function paymentRoutes(
  app: FastifyInstance,
  authenticate: ReturnType<typeof createStaffAuthenticator>,
  pool: TenantPool | undefined,
  suppliedProvider?: ConnectProvider,
) {
  let provider = suppliedProvider
  const attempts = new Map<string, { count: number; until: number }>()
  const params = {
    type: 'object',
    additionalProperties: false,
    required: ['clinicId'],
    properties: {
      clinicId: {
        type: 'string',
        pattern:
          '^(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|[A-Za-z]{2}-[0-9]{4})$',
      },
    },
  }
  async function handle(request: Request, reply: FastifyReply, write: boolean) {
    reply.header('Cache-Control', 'no-store')
    const identityId = await authenticate(request, reply)
    if (!identityId) return
    if (!pool) return reply.code(503).send({ error: 'Recebimentos indisponíveis.' })
    try {
      const transaction = <T>(work: Parameters<typeof withClinicTransaction<T>>[4]) =>
        withClinicTransaction(pool, identityId, request.params.clinicId, 'settings:manage', work)
      // Check tenant and current grant BEFORE touching Stripe or its configuration.
      const clinicId = await transaction(async (_connection, tenant) => tenant.clinicId)
      const now = Date.now()
      for (const [key, attempt] of attempts) if (attempt.until <= now) attempts.delete(key)
      const key = `${identityId}:${clinicId}`
      const attempt = attempts.get(key)
      if ((attempt?.count ?? 0) >= 15 || (!attempt && attempts.size >= 10_000))
        return reply
          .code(429)
          .header('Retry-After', '60')
          .send({ error: 'Aguarde um minuto para tentar novamente.' })
      attempts.set(key, { count: (attempt?.count ?? 0) + 1, until: attempt?.until ?? now + 60_000 })
      provider ??= createConnectProvider()
      const context = await provider.context()
      const binding = await transaction(async (connection, tenant) => {
        const result = await connection.query(
          write && request.body?.purpose === 'onboarding'
            ? 'SELECT * FROM luminix.reserve_stripe_connect($1, $2, $3)'
            : 'SELECT account_id, creation_key, creation_started_at FROM luminix.stripe_connect_accounts WHERE clinic_id = $1 AND platform_account_id = $2 AND livemode = $3',
          [tenant.clinicId, context.platformAccountId, context.livemode],
        )
        return result.rows[0] as Binding | undefined
      })
      if (!write) {
        const status = binding?.account_id
          ? await provider.status(binding.account_id)
          : {
              state: binding ? 'pending' : 'not_started',
              chargesEnabled: false,
              payoutsEnabled: false,
              requirementsDue: 0,
              testMode: !context.livemode,
            }
        await transaction(async () => undefined)
        return { status }
      }
      const purpose = request.body!.purpose
      if (!binding) return reply.code(409).send({ error: 'Configure os recebimentos primeiro.' })
      let accountId = binding.account_id
      if (!accountId) {
        if (purpose !== 'onboarding')
          return reply.code(409).send({ error: 'Conclua o cadastro Stripe primeiro.' })
        // Stripe may prune idempotency keys after 24h. Never silently create a second account.
        if (now - new Date(binding.creation_started_at).getTime() >= 23 * 60 * 60 * 1000)
          return reply.code(409).send({
            error:
              'Precisamos verificar uma tentativa anterior de conexão. Entre em contato com o suporte antes de continuar.',
          })
        accountId = await provider.create(clinicId, binding.creation_key)
        const createdAccountId = accountId
        await transaction(async (connection, tenant) => {
          await connection.query('SELECT luminix.bind_stripe_connect($1, $2, $3, $4, $5)', [
            tenant.clinicId,
            context.platformAccountId,
            context.livemode,
            binding.creation_key,
            createdAccountId,
          ])
        })
      }
      // External calls never hold a DB transaction or authorization locks open.
      await transaction(async () => undefined)
      const clientSecret = await provider.session(accountId, purpose)
      await transaction(async () => undefined)
      request.log.info({ event: 'stripe_connect_session_created', clinicId, identityId, purpose })
      return { clientSecret, publishableKey: context.publishableKey, testMode: !context.livemode }
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode === 403)
        return reply
          .code(403)
          .send({ error: 'Você não tem permissão para configurar os recebimentos desta clínica.' })
      request.log.warn({ event: 'stripe_connect_unavailable' })
      return reply.code(503).send({
        error:
          'Não foi possível acessar a Stripe. Tente novamente em instantes; seu cadastro salvo será retomado.',
      })
    }
  }
  app.get('/clinics/:clinicId/payments/connect', { schema: { params } }, (request, reply) =>
    handle(request as Request, reply, false),
  )
  app.post(
    '/clinics/:clinicId/payments/connect/session',
    {
      bodyLimit: 1024,
      schema: {
        params,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['purpose'],
          properties: {
            purpose: { type: 'string', enum: ['onboarding', 'management', 'payments', 'payouts'] },
          },
        },
      },
    },
    (request, reply) => handle(request as Request, reply, true),
  )
}
