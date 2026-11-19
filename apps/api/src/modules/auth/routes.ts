import type { FastifyInstance } from 'fastify'
import { createStaffAuthenticator, type AuthDependencies } from '../../shared/auth/staff-session.js'
import { clinicRoutes } from '../clinics/routes.js'
import { paymentRoutes } from '../payments/routes.js'
import { operationRoutes } from '../operations/routes.js'
import { teamRoutes } from '../team/routes.js'
import { mediaRoutes } from '../media/routes.js'
import { packageRoutes } from '../catalog/packages-routes.js'
import { marketingRoutes } from '../marketing/routes.js'
import { catalogRoutes } from '../catalog/routes.js'
import { financeRoutes } from '../finance/routes.js'
import { inventoryRoutes } from '../inventory/routes.js'
import { insightsRoutes } from '../insights/routes.js'
import { workspaceRoutes } from '../workspace/routes.js'
import { formatClinicGeocodeAddress, pickGeocodedPoint } from './geocode.js'
import { accessMail } from '../team/access-mail.js'
export type { AuthDependencies } from '../../shared/auth/staff-session.js'

export async function authRoutes(app: FastifyInstance, dependencies: AuthDependencies) {
  app.addHook('onSend', async (request, reply, payload) => {
    if (
      request.routeOptions.url?.startsWith('/auth/') ||
      request.routeOptions.url?.startsWith('/address/') ||
      request.routeOptions.url?.startsWith('/clinics/')
    )
      reply.header('Cache-Control', 'no-store')
    return payload
  })
  const authenticate = createStaffAuthenticator(dependencies)
  await clinicRoutes(app, authenticate, dependencies.tenantPool, dependencies.connectProvider)
  await operationRoutes(app, authenticate, dependencies.tenantPool)
  await paymentRoutes(app, authenticate, dependencies.tenantPool, dependencies.connectProvider)
  await teamRoutes(app, authenticate, dependencies)
  await mediaRoutes(app, authenticate, dependencies.tenantPool)
  await catalogRoutes(app, authenticate, dependencies.tenantPool)
  await packageRoutes(app, authenticate, dependencies.tenantPool)
  await financeRoutes(app, authenticate, dependencies.tenantPool)
  await inventoryRoutes(app, authenticate, dependencies.tenantPool)
  await insightsRoutes(app, authenticate, dependencies.tenantPool)
  await marketingRoutes(app, authenticate, dependencies.tenantPool)
  await workspaceRoutes(app, authenticate, dependencies.tenantPool)
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
  // Public "receber link de acesso". Same answer whether or not the account exists; mails only
  // existing accounts. Behind the admin proxy every caller shares one IP, so the limits are per
  // e-mail (3 per 15 min) and global (60 per minute), both bounded in memory.
  const linkByEmail = new Map<string, { count: number; until: number }>()
  const linkGlobal = { count: 0, until: 0 }
  app.post<{ Body: { email: string } }>(
    '/auth/access-link',
    {
      bodyLimit: 1024,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['email'],
          properties: {
            email: {
              type: 'string',
              minLength: 3,
              maxLength: 254,
              pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
            },
          },
        },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store')
      const mail = accessMail(dependencies)
      if (!mail) return reply.code(503).send({ error: 'Email unavailable' })
      const now = Date.now()
      if (linkGlobal.until <= now) Object.assign(linkGlobal, { count: 0, until: now + 60_000 })
      for (const [key, value] of linkByEmail) if (value.until <= now) linkByEmail.delete(key)
      const email = request.body.email.trim().toLowerCase()
      const previous = linkByEmail.get(email)
      if (
        linkGlobal.count >= 60 ||
        (previous?.count ?? 0) >= 3 ||
        (!previous && linkByEmail.size >= 10_000)
      )
        return reply.code(429).header('Retry-After', '60').send({ error: 'Too many requests' })
      linkGlobal.count += 1
      linkByEmail.set(email, {
        count: (previous?.count ?? 0) + 1,
        until: previous?.until ?? now + 15 * 60_000,
      })
      try {
        await mail.signIn(email)
      } catch {
        request.log.warn({ event: 'staff_sign_in_link_failed' })
        return reply.code(503).send({ error: 'Email unavailable' })
      }
      return reply.code(202).send({ sent: true })
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
  app.get<{
    Querystring: {
      line: string
      number?: string
      district?: string
      city?: string
      state?: string
      postalCode?: string
    }
  }>(
    '/address/geocode',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          required: ['line'],
          properties: {
            line: { type: 'string', minLength: 3, maxLength: 240 },
            number: { type: 'string', maxLength: 20 },
            district: { type: 'string', maxLength: 120 },
            city: { type: 'string', maxLength: 120 },
            state: { type: 'string', maxLength: 2 },
            postalCode: { type: 'string', maxLength: 9 },
          },
        },
      },
    },
    async (request, reply) => {
      const identityId = await authenticate(request, reply)
      if (!identityId) return
      const city = request.query.city?.trim() ?? ''
      const state = request.query.state?.trim().toUpperCase() ?? ''
      const postalCode = (request.query.postalCode ?? '').replace(/\D/g, '')
      if (state && !/^[A-Z]{2}$/.test(state))
        return reply.code(400).send({ error: 'Invalid state' })
      if (city.length < 2 && postalCode.length !== 8)
        return reply.code(400).send({ error: 'Incomplete address' })
      const key = process.env.GOOGLE_MAPS_API_KEY?.trim()
      if (!key) return reply.code(503).send({ error: 'Geocoding unavailable' })
      try {
        const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
        url.searchParams.set(
          'address',
          formatClinicGeocodeAddress({
            line: request.query.line,
            number: request.query.number,
            district: request.query.district,
            city,
            state,
            postalCode,
          }),
        )
        url.searchParams.set('components', 'country:BR')
        url.searchParams.set('region', 'br')
        url.searchParams.set('language', 'pt-BR')
        url.searchParams.set('key', key)
        const response = await fetch(url, { signal: AbortSignal.timeout(8_000) })
        if (!response.ok) throw new Error('Geocoder unavailable')
        const body = (await response.json()) as {
          status?: string
          results?: Array<{
            geometry?: {
              location?: { lat?: unknown; lng?: unknown }
              location_type?: string
            }
          }>
        }
        if (body.status === 'REQUEST_DENIED' || body.status === 'OVER_QUERY_LIMIT') {
          request.log.warn({ event: 'geocode_denied', status: body.status })
          return reply.code(503).send({ error: 'Geocoding unavailable' })
        }
        const location = pickGeocodedPoint(body)
        if (!location) return reply.code(404).send({ error: 'Location not found' })
        return { location }
      } catch {
        request.log.info({ event: 'geocode_unavailable' })
        return reply.code(503).send({ error: 'Geocoding unavailable' })
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
