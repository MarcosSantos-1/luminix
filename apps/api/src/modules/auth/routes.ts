import type { FastifyInstance } from 'fastify'
import { createStaffAuthenticator, type AuthDependencies } from '../../shared/auth/staff-session.js'
import { clinicRoutes } from '../clinics/routes.js'
import { operationRoutes } from '../operations/routes.js'
export type { AuthDependencies } from '../../shared/auth/staff-session.js'

export async function authRoutes(app: FastifyInstance, dependencies: AuthDependencies) {
  app.addHook('onSend', async (request, reply, payload) => {
    if (
      request.routeOptions.url?.startsWith('/auth/') ||
      request.routeOptions.url?.startsWith('/clinics/')
    )
      reply.header('Cache-Control', 'no-store')
    return payload
  })
  const authenticate = createStaffAuthenticator(dependencies)
  await clinicRoutes(app, authenticate, dependencies.tenantPool)
  await operationRoutes(app, authenticate, dependencies.tenantPool)
  app.get<{ Querystring: { after?: string } }>(
    '/auth/clinics',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { after: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      const identityId = await authenticate(request, reply)
      if (!identityId) return
      try {
        const result = await dependencies.database.query(
          'SELECT * FROM luminix.list_staff_clinics($1::uuid, $2::uuid)',
          [identityId, request.query.after ?? null],
        )
        const clinics = result.rows.slice(0, 50).map((row) => ({
          id: String(row.clinic_id),
          code: row.clinic_code ? String(row.clinic_code) : String(row.clinic_id),
          name: String(row.clinic_name),
          status: String(row.clinic_status),
          role: String(row.role_name),
        }))
        return { clinics, nextCursor: result.rows.length > 50 ? clinics.at(-1)!.id : null }
      } catch {
        request.log.warn({ event: 'clinic_list_unavailable' })
        return reply.code(503).send({ error: 'Clinics unavailable' })
      }
    },
  )
  app.get('/auth/session', async (request, reply) => {
    const identityId = await authenticate(request, reply)
    if (!identityId) return
    return { identity: { id: identityId } }
  })
  app.get<{ Params: { cep: string } }>(
    '/address/postal-code/:cep',
    {
      schema: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['cep'],
          properties: { cep: { type: 'string', pattern: '^[0-9]{8}$' } },
        },
      },
    },
    async (request, reply) => {
      const identityId = await authenticate(request, reply)
      if (!identityId) return
      try {
        const response = await fetch(`https://viacep.com.br/ws/${request.params.cep}/json/`, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(5_000),
        })
        if (!response.ok) throw new Error('Postal code provider unavailable')
        const data = (await response.json()) as Record<string, unknown>
        if (data.erro === true) return reply.code(404).send({ error: 'Postal code not found' })
        return {
          address: {
            postalCode: String(data.cep ?? ''),
            street: String(data.logradouro ?? ''),
            district: String(data.bairro ?? ''),
            city: String(data.localidade ?? ''),
            state: String(data.uf ?? '').toUpperCase(),
          },
        }
      } catch {
        request.log.info({ event: 'postal_code_lookup_unavailable' })
        return reply.code(503).send({ error: 'Postal code lookup unavailable' })
      }
    },
  )
  app.post<{ Body: { name: string } }>(
    '/auth/owner-clinic',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['name'],
          properties: { name: { type: 'string', minLength: 1, maxLength: 160, pattern: '\\S' } },
        },
      },
    },
    async (request, reply) => {
      const identityId = await authenticate(request, reply)
      if (!identityId) return
      try {
        const result = await dependencies.database.query(
          'SELECT * FROM luminix.bootstrap_owner_clinic($1::uuid, $2::text)',
          [identityId, request.body.name.trim()],
        )
        const clinic = result.rows[0]
        if (!clinic) throw new Error('Bootstrap returned no clinic')
        return reply.code(clinic.created ? 201 : 200).send({
          clinic: {
            id: String(clinic.clinic_id),
            code: clinic.clinic_code ? String(clinic.clinic_code) : String(clinic.clinic_id),
            name: String(clinic.clinic_name),
            slug: String(clinic.clinic_slug),
            status: String(clinic.clinic_status),
          },
        })
      } catch (error) {
        const code = (error as { code?: string })?.code
        if (code === '42501') return reply.code(403).send({ error: 'Clinic creation unavailable' })
        if (code === '22023')
          return reply
            .code(409)
            .send({ error: 'First clinic already created with different details' })
        request.log.warn(
          { event: 'owner_clinic_bootstrap_unavailable' },
          'Clinic creation unavailable',
        )
        return reply.code(503).send({ error: 'Clinic creation unavailable' })
      }
    },
  )
}
