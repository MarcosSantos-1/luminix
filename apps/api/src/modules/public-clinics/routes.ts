import type { FastifyInstance } from 'fastify'
import type { SqlConnection } from '../../shared/database/migrations.js'
import { publicClinicResponse } from '../clinics/settings-routes.js'

export async function publicClinicRoutes(app: FastifyInstance, database: SqlConnection) {
  const attempts = new Map<string, { count: number; until: number }>()
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
      const now = Date.now()
      for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key)
      const current = attempts.get(request.ip)
      if ((current?.count ?? 0) >= 120 || (!current && attempts.size >= 10_000))
        return reply.code(429).header('Retry-After', '60').send({ error: 'Too many requests' })
      attempts.set(request.ip, {
        count: (current?.count ?? 0) + 1,
        until: current?.until ?? now + 60_000,
      })
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
