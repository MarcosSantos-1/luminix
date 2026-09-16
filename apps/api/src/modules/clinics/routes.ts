import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { SqlConnection } from '../../shared/database/migrations.js'
import { withClinicTransaction, type TenantPool } from '../../shared/tenant/clinic-transaction.js'
import type { TenantContext } from '../../shared/tenant/tenant-context.js'

type OnboardingPayload = {
  name: string
  occupations: string[]
  services: { name: string; priceCents: number; durationMinutes: number }[]
  professionals: string[]
}

function validPayload(payload: OnboardingPayload): boolean {
  const unique = (names: string[]) =>
    new Set(names.map((name) => name.trim().toLocaleLowerCase('pt-BR'))).size === names.length
  return Boolean(
    payload.name.trim() &&
    unique(payload.occupations) &&
    unique(payload.services.map((service) => service.name)) &&
    payload.occupations.every((name) => name.trim()) &&
    payload.professionals.every((name) => name.trim()) &&
    payload.services.every((service) => service.name.trim()),
  )
}

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
      if ((error as { code?: string })?.code === '23505')
        return reply.code(409).send({ error: 'Onboarding changed; reload before retrying' })
      if ((error as { code?: string })?.code === '22023')
        return reply.code(400).send({ error: 'Invalid onboarding data' })
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
            'SELECT id, name, slug, status, share_code FROM luminix.clinics WHERE id = $1',
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

  const onboardingPayloadSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'occupations', 'services', 'professionals'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 160 },
      occupations: {
        type: 'array',
        maxItems: 20,
        items: { type: 'string', minLength: 1, maxLength: 120 },
      },
      services: {
        type: 'array',
        maxItems: 30,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'priceCents', 'durationMinutes'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 160 },
            priceCents: { type: 'integer', minimum: 0, maximum: 999999999 },
            durationMinutes: { type: 'integer', minimum: 1, maximum: 1440 },
          },
        },
      },
      professionals: {
        type: 'array',
        maxItems: 20,
        items: { type: 'string', minLength: 1, maxLength: 160 },
      },
    },
  } as const
  app.get<{ Params: { clinicId: string } }>(
    '/clinics/:clinicId/onboarding',
    { schema: { params } },
    async (request, reply) =>
      authorized(request, reply, 'onboarding:manage', async (connection, tenant) => {
        const draft = (
          await connection.query(
            'SELECT version, format_version, step, status, payload FROM luminix.onboarding_drafts WHERE clinic_id = $1',
            [tenant.clinicId],
          )
        ).rows[0]
        const clinic = (
          await connection.query('SELECT name, status FROM luminix.clinics WHERE id = $1', [
            tenant.clinicId,
          ])
        ).rows[0]
        if (!clinic) throw new Error('Clinic unavailable')
        return {
          draft: draft
            ? {
                version: Number(draft.version),
                formatVersion: Number(draft.format_version),
                step: draft.step,
                status: draft.status,
                payload: draft.payload,
              }
            : {
                version: 0,
                formatVersion: 1,
                step: 'clinic',
                status: 'draft',
                payload: { name: clinic.name, occupations: [], services: [], professionals: [] },
              },
        }
      }),
  )
  app.put<{
    Params: { clinicId: string }
    Body: { version: number; step: string; payload: OnboardingPayload }
  }>(
    '/clinics/:clinicId/onboarding',
    {
      bodyLimit: 32768,
      schema: {
        params,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['version', 'step', 'payload'],
          properties: {
            version: { type: 'integer', minimum: 0 },
            step: {
              type: 'string',
              enum: ['clinic', 'occupations', 'services', 'professionals', 'review'],
            },
            payload: onboardingPayloadSchema,
          },
        },
      },
    },
    async (request, reply) => {
      if (!validPayload(request.body.payload))
        return reply.code(400).send({ error: 'Invalid onboarding data' })
      return authorized(request, reply, 'onboarding:manage', async (connection, tenant) => {
        const row = (
          await connection.query(
            'SELECT * FROM luminix.save_onboarding_draft($1::uuid, $2::integer, $3::text, $4::jsonb)',
            [
              tenant.clinicId,
              request.body.version,
              request.body.step,
              JSON.stringify(request.body.payload),
            ],
          )
        ).rows[0]
        return {
          draft: {
            version: Number(row.draft_version),
            formatVersion: 1,
            step: row.draft_step,
            status: 'draft',
            payload: row.draft_payload,
          },
        }
      })
    },
  )
  app.post<{ Params: { clinicId: string }; Body: { version: number } }>(
    '/clinics/:clinicId/onboarding/complete',
    {
      schema: {
        params,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['version'],
          properties: { version: { type: 'integer', minimum: 1 } },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'onboarding:manage', async (connection, tenant) => {
        const row = (
          await connection.query(
            'SELECT * FROM luminix.complete_onboarding($1::uuid, $2::integer)',
            [tenant.clinicId, request.body.version],
          )
        ).rows[0]
        return {
          clinic: {
            id: tenant.clinicId,
            name: row.clinic_name,
            status: row.clinic_status,
            shareCode: row.clinic_share_code,
          },
          version: Number(row.draft_version),
          replayed: row.replayed,
        }
      }),
  )
  app.get<{ Params: { clinicId: string } }>(
    '/clinics/:clinicId/overview',
    { schema: { params } },
    async (request, reply) =>
      authorized(request, reply, 'clinic:manage', async (connection, tenant) => {
        const occupations = await connection.query(
          'SELECT name FROM luminix.occupations WHERE clinic_id = $1 ORDER BY name LIMIT 30',
          [tenant.clinicId],
        )
        const services = await connection.query(
          'SELECT name, price_cents, duration_minutes FROM luminix.services WHERE clinic_id = $1 AND status = $2 ORDER BY name LIMIT 30',
          [tenant.clinicId, 'active'],
        )
        const professionals = await connection.query(
          'SELECT display_name FROM luminix.professionals WHERE clinic_id = $1 AND status = $2 ORDER BY display_name LIMIT 20',
          [tenant.clinicId, 'active'],
        )
        const clinic = await connection.query(
          'SELECT name, status, share_code FROM luminix.clinics WHERE id = $1',
          [tenant.clinicId],
        )
        return {
          clinic: clinic.rows[0],
          occupations: occupations.rows,
          services: services.rows,
          professionals: professionals.rows,
        }
      }),
  )
}
