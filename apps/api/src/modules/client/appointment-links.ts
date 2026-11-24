import { createHash, randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { SqlConnection } from '../../shared/database/migrations.js'
import { publicMediaUrl } from '../clinics/media-storage.js'

// Confirmation link of one visit (ADR-038). No login: whoever has the link sees the essentials
// of that visit and answers. The token is 32 random bytes (base64url, 43 chars); the database
// only keeps its SHA-256, so a leaked table does not leak working links.

export const linkTokenPattern = '^[A-Za-z0-9_-]{43}$'

export function hashLinkToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest()
}

export function newLinkToken() {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: hashLinkToken(token) }
}

/** Public page of the link on the site; localhost only outside production. */
export function appointmentLinkUrl(token: string) {
  const fallback = process.env.NODE_ENV !== 'production' ? 'http://localhost:3001' : undefined
  const raw = process.env.PUBLIC_CLINIC_WEB_ORIGIN || fallback
  if (!raw) return null
  try {
    const url = new URL(raw)
    const local = url.hostname === 'localhost' && process.env.NODE_ENV !== 'production'
    if (url.protocol !== 'https:' && !local) return null
    return `${url.origin}/confirmar/${token}`
  } catch {
    return null
  }
}

/** A missing media origin hides the logo instead of failing the whole page. */
function logoUrl(key: string) {
  try {
    return publicMediaUrl(key)
  } catch {
    return null
  }
}

const answers = ['confirmed', 'reschedule', 'not_me', 'canceled'] as const
type Answer = (typeof answers)[number]

/**
 * Under /client/ so the site and the app reach it with the client-area CORS, but without the
 * Bearer token: the link itself is the credential. Own budget per IP, tighter than the area's.
 */
export async function appointmentLinkRoutes(app: FastifyInstance, database: SqlConnection) {
  const attempts = new Map<string, { count: number; until: number }>()
  const limited = (ip: string) => {
    const now = Date.now()
    for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key)
    const current = attempts.get(ip)
    if ((current?.count ?? 0) >= 30 || (!current && attempts.size >= 10_000)) return true
    attempts.set(ip, { count: (current?.count ?? 0) + 1, until: current?.until ?? now + 60_000 })
    return false
  }
  const params = {
    type: 'object',
    additionalProperties: false,
    required: ['token'],
    properties: { token: { type: 'string', pattern: linkTokenPattern } },
  } as const

  app.get<{ Params: { token: string } }>(
    '/client/appointment-links/:token',
    { schema: { params } },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store').header('Referrer-Policy', 'no-referrer')
      if (limited(request.ip))
        return reply.code(429).header('Retry-After', '60').send({ error: 'Too many requests' })
      try {
        const result = await database.query('SELECT luminix.read_appointment_link($1) AS link', [
          hashLinkToken(request.params.token),
        ])
        const link = (result.rows[0]?.link ?? null) as {
          clinic?: { logoKey?: string | null } & Record<string, unknown>
        } | null
        if (!link) return reply.code(404).send({ error: 'Link not found' })
        // The storage key never leaves the API: only the public URL of the space's logo.
        const { logoKey, ...clinic } = link.clinic ?? {}
        return {
          ...link,
          clinic: { ...clinic, logoUrl: logoKey ? logoUrl(String(logoKey)) : null },
        }
      } catch {
        request.log.warn({ event: 'appointment_link_unavailable' })
        return reply.code(503).send({ error: 'Link unavailable' })
      }
    },
  )

  app.post<{ Params: { token: string }; Body: { answer: Answer } }>(
    '/client/appointment-links/:token',
    {
      bodyLimit: 512,
      schema: {
        params,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['answer'],
          properties: { answer: { type: 'string', enum: [...answers] } },
        },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store')
      if (limited(request.ip))
        return reply.code(429).header('Retry-After', '60').send({ error: 'Too many requests' })
      try {
        const result = await database.query(
          'SELECT luminix.answer_appointment_link($1, $2) AS result',
          [hashLinkToken(request.params.token), request.body.answer],
        )
        return result.rows[0]?.result ?? { answer: request.body.answer }
      } catch (error) {
        const code = (error as { code?: string }).code
        if (code === 'P0002') return reply.code(404).send({ error: 'Link not found' })
        if (code === '55000') return reply.code(409).send({ error: 'Appointment closed' })
        if (code === 'P0001') return reply.code(409).send({ error: 'Cancellation closed' })
        if (code === '22023') return reply.code(400).send({ error: 'Invalid answer' })
        request.log.warn({ event: 'appointment_link_answer_unavailable' })
        return reply.code(503).send({ error: 'Link unavailable' })
      }
    },
  )
}
