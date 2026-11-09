import type { FastifyReply, FastifyRequest } from 'fastify'
import type { SqlConnection } from '../database/migrations.js'
import { invalidatePublicClinic } from '../../modules/clinics/public-cache.js'
import { withClinicTransaction, type TenantPool } from './clinic-transaction.js'
import type { TenantContext } from './tenant-context.js'

/** Route params for `/clinics/:clinicId/...`: UUID or space code (AB-1234). */
export const clinicRefParams = {
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
} as const

export type Authenticate = (request: FastifyRequest, reply: FastifyReply) => Promise<string | null>

export type AuthorizedRoute = (
  request: FastifyRequest<{ Params: { clinicId: string } }>,
  reply: FastifyReply,
  permission: string | null,
  work: (connection: SqlConnection, tenant: TenantContext) => Promise<unknown>,
  beforeWrite?: (identityId: string) => Promise<void>,
  affectsPublicPage?: boolean,
) => Promise<unknown>

/**
 * Runs `work` inside one tenant transaction after authenticating and authorizing `permission`.
 * Errors become safe HTTP codes; database details never reach the client. When
 * `affectsPublicPage` is set, the public page cache of the clinic is expired after commit.
 */
export function createAuthorizedRoute(
  authenticate: Authenticate,
  pool: TenantPool | undefined,
): AuthorizedRoute {
  return async function authorized(
    request,
    reply,
    permission,
    work,
    beforeWrite,
    affectsPublicPage = false,
  ) {
    const identityId = await authenticate(request, reply)
    if (!identityId) return
    if (!pool) return reply.code(503).send({ error: 'Clinic unavailable' })
    try {
      await beforeWrite?.(identityId)
      let publicSlug: string | undefined
      const result = await withClinicTransaction(
        pool,
        identityId,
        request.params.clinicId,
        permission,
        async (connection, tenant) => {
          request.tenantContext = tenant
          try {
            const result = await work(connection, tenant)
            if (affectsPublicPage) {
              const { rows } = await connection.query(
                'SELECT slug FROM luminix.clinics WHERE id = $1',
                [tenant.clinicId],
              )
              if (typeof rows[0]?.slug === 'string') publicSlug = rows[0].slug
            }
            return result
          } finally {
            request.tenantContext = null
          }
        },
      )
      if (publicSlug) await invalidatePublicClinic(publicSlug, request.log)
      return result
    } catch (error) {
      const statusCode = (error as { statusCode?: number })?.statusCode
      if (statusCode && [400, 409, 413].includes(statusCode))
        return reply.code(statusCode).send({ error: (error as Error).message })
      if (statusCode === 503 && (error as Error).message === 'Stripe verification unavailable')
        return reply.code(503).send({ error: 'Stripe verification unavailable' })
      if ((error as { statusCode?: number })?.statusCode === 403) {
        request.log.info({ event: 'clinic_access_denied' })
        return reply.code(403).send({ error: 'Clinic access denied' })
      }
      if ((error as { code?: string })?.code === '23505')
        return reply.code(409).send({ error: 'Onboarding changed; reload before retrying' })
      if (['22023', '22P02', '23514'].includes((error as { code?: string })?.code ?? ''))
        return reply.code(400).send({ error: 'Invalid onboarding data' })
      request.log.warn({ event: 'clinic_read_unavailable' })
      return reply.code(503).send({ error: 'Clinic unavailable' })
    }
  }
}
