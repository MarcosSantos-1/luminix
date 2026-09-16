import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { SqlConnection } from '../../shared/database/migrations.js'
import { withClinicTransaction, type TenantPool } from '../../shared/tenant/clinic-transaction.js'
import type { TenantContext } from '../../shared/tenant/tenant-context.js'

export async function clinicRoutes(
  app: FastifyInstance,
  authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<string | null>,
  pool: TenantPool | undefined,
) {
  const params = {
    type: 'object',
    additionalProperties: false,
    required: ['clinicId'],
    properties: { clinicId: { type: 'string', format: 'uuid' } },
  }
  async function authorized(
    request: FastifyRequest<{ Params: { clinicId: string } }>,
    reply: FastifyReply,
    permission: string | null,
    work: (connection: SqlConnection, tenant: TenantContext) => Promise<unknown>,
  ) {
    const identityId = await authenticate(request, reply)
    if (!identityId) return
    if (!pool) return reply.code(503).send({ error: 'Clinic unavailable' })
    try {
      return await withClinicTransaction(
        pool,
        identityId,
        request.params.clinicId,
        permission,
        async (connection, tenant) => {
          request.tenantContext = tenant
          try {
            return await work(connection, tenant)
          } finally {
            request.tenantContext = null
          }
        },
      )
    } catch (error) {
      if ((error as { statusCode?: number })?.statusCode === 403) {
        request.log.info({ event: 'clinic_access_denied' })
        return reply.code(403).send({ error: 'Clinic access denied' })
      }
      request.log.warn({ event: 'clinic_read_unavailable' })
      return reply.code(503).send({ error: 'Clinic unavailable' })
    }
  }
  app.get<{ Params: { clinicId: string } }>(
    '/clinics/:clinicId/context',
    { schema: { params } },
    async (request, reply) =>
      authorized(request, reply, null, async (connection, tenant) => {
        const clinic = (
          await connection.query(
            'SELECT id, name, slug, status FROM luminix.clinics WHERE id = $1',
            [tenant.clinicId],
          )
        ).rows[0]
        const grants = (
          await connection.query(
            'SELECT permission_code FROM luminix.role_permissions WHERE clinic_id = $1 AND role_id = $2 ORDER BY permission_code',
            [tenant.clinicId, tenant.role],
          )
        ).rows
        if (!clinic) throw new Error('Clinic unavailable')
        return { clinic, permissions: grants.map((grant) => String(grant.permission_code)) }
      }),
  )
  app.get<{ Params: { clinicId: string } }>(
    '/clinics/:clinicId/settings',
    { schema: { params } },
    async (request, reply) =>
      authorized(request, reply, 'settings:manage', async (connection, tenant) => {
        const settings = (
          await connection.query(
            'SELECT timezone, locale, currency FROM luminix.clinic_settings WHERE clinic_id = $1',
            [tenant.clinicId],
          )
        ).rows[0]
        if (!settings) throw new Error('Settings unavailable')
        return { settings }
      }),
  )
}
