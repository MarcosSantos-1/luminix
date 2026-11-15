import type { FastifyInstance } from 'fastify'
import type { SqlConnection } from '../../shared/database/migrations.js'
import { publicClinicResponse } from '../clinics/settings-routes.js'

/** Only what the space picker shows; the address follows the clinic's own publication opt-in. */
function publicClinicSummary(projection: Record<string, unknown>) {
  const clinic = publicClinicResponse(projection) as Record<string, unknown>
  const location = (clinic.location ?? {}) as Record<string, string | null | undefined>
  return {
    slug: clinic.slug,
    code: clinic.code ?? null,
    name: clinic.name,
    theme: clinic.theme,
    logoUrl: clinic.logoUrl,
    city: location.city ?? null,
    state: location.state ?? null,
    address: [location.line, location.number].filter(Boolean).join(', ') || null,
    district: location.district ?? null,
    category: clinic.heroCategory ?? null,
  }
}

export async function publicClinicRoutes(app: FastifyInstance, database: SqlConnection) {
  const attempts = new Map<string, { count: number; until: number }>()
  // The name search enumerates published clinics, so it gets its own, tighter budget per IP.
  // Half the page budget: the web proxy answers repeated terms from its one-minute cache.
  const searches = new Map<string, { count: number; until: number }>()
  const limited = (bucket: typeof attempts, ip: string, max: number) => {
    const now = Date.now()
    for (const [key, value] of bucket) if (value.until <= now) bucket.delete(key)
    const current = bucket.get(ip)
    if ((current?.count ?? 0) >= max || (!current && bucket.size >= 10_000)) return true
    bucket.set(ip, { count: (current?.count ?? 0) + 1, until: current?.until ?? now + 60_000 })
    return false
  }
  app.get<{ Querystring: { q: string } }>(
    '/public/clinic-search',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          required: ['q'],
          properties: { q: { type: 'string', minLength: 3, maxLength: 120 } },
        },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store')
      if (limited(searches, request.ip, 60))
        return reply.code(429).header('Retry-After', '60').send({ error: 'Too many requests' })
      try {
        const result = await database.query(
          `SELECT luminix.read_public_clinic(found.slug) AS clinic
           FROM luminix.search_public_clinics($1::text) WITH ORDINALITY AS found(slug, position)
           ORDER BY found.position`,
          [request.query.q],
        )
        return {
          clinics: result.rows
            .map((row) => row.clinic as Record<string, unknown> | null)
            .filter((clinic) => clinic !== null)
            .map(publicClinicSummary),
        }
      } catch {
        request.log.warn({ event: 'public_clinic_search_unavailable' })
        return reply.code(503).send({ error: 'Search unavailable' })
      }
    },
  )
  app.get<{ Params: { slug: string } }>(
    '/public/clinics/:slug',
    {
      schema: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['slug'],
          properties: {
            slug: {
              type: 'string',
              minLength: 1,
              maxLength: 80,
              pattern: '^[a-z0-9]+(-[a-z0-9]+)*$',
            },
          },
        },
      },
    },
    async (request, reply) => {
      // No cache of withdrawn publications. Client identity/headers never influence the projection.
      reply.header('Cache-Control', 'no-store')
      if (limited(attempts, request.ip, 120))
        return reply.code(429).header('Retry-After', '60').send({ error: 'Too many requests' })
      try {
        const result = await database.query(
          'SELECT luminix.read_public_clinic($1::text) AS clinic',
          [request.params.slug],
        )
        const clinic = result.rows[0]?.clinic as Record<string, unknown> | null
        if (!clinic) {
          // Replaced addresses of published clinics keep working through a redirect.
          const moved = await database.query(
            'SELECT luminix.resolve_public_slug($1::text) AS slug',
            [request.params.slug],
          )
          const redirectTo = moved.rows[0]?.slug
          if (typeof redirectTo === 'string' && redirectTo !== request.params.slug)
            return { redirectTo }
          return reply.code(404).send({ error: 'Clinic not found' })
        }
        return { clinic: publicClinicResponse(clinic) }
      } catch {
        request.log.warn({ event: 'public_clinic_unavailable' })
        return reply.code(503).send({ error: 'Clinic unavailable' })
      }
    },
  )
}
