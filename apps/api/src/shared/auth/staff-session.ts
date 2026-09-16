import type { FastifyReply, FastifyRequest } from 'fastify'

import type { SqlConnection } from '../database/migrations.js'
import type { TenantPool } from '../tenant/clinic-transaction.js'

export type AuthDependencies = {
  verifyToken(token: string): Promise<{ uid: string }>
  database: SqlConnection
  tenantPool?: TenantPool
}

export function createStaffAuthenticator(dependencies: AuthDependencies) {
  // Bounded, per-process protection. Never trust forwarding headers for the rate key.
  const attempts = new Map<string, { count: number; until: number }>()
  return async (request: FastifyRequest, reply: FastifyReply): Promise<string | null> => {
    reply.header('Cache-Control', 'no-store')
    const now = Date.now()
    for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key)
    const attempt = attempts.get(request.ip)
    if ((attempt?.count ?? 0) >= 30 || (!attempt && attempts.size >= 10_000)) {
      reply.code(429).header('Retry-After', '60').send({ error: 'Too many requests' })
      return null
    }
    attempts.set(request.ip, {
      count: (attempt?.count ?? 0) + 1,
      until: attempt?.until ?? now + 60_000,
    })
    const bearer = /^Bearer ([^\s,]+)$/i.exec(request.headers.authorization ?? '')
    if (!bearer || bearer[1].length > 8192) {
      request.log.info({ event: 'staff_session_denied', reason: 'missing_bearer' })
      reply.code(401).send({ error: 'Authentication required' })
      return null
    }
    let uid: string
    try {
      const token = await dependencies.verifyToken(bearer[1])
      uid = token.uid
      if (!uid || uid.length > 128) throw new Error('Invalid UID')
    } catch {
      request.log.info({ event: 'staff_session_denied', reason: 'invalid_token' })
      reply.code(401).send({ error: 'Invalid session' })
      return null
    }
    try {
      // Conflict never reactivates a disabled identity and never associates by email.
      // SELECT after INSERT sees a concurrently committed identity under READ COMMITTED.
      const inserted = await dependencies.database.query(
        'SELECT * FROM luminix.resolve_staff_identity($1::text)',
        [uid],
      )
      if (inserted.rows[0]?.created) {
        request.log.info({
          event: 'staff_identity_created',
          identityId: String(inserted.rows[0].identity_id),
        })
      }
      const identity = inserted.rows[0]
      if (!identity || identity.identity_status !== 'active') {
        request.log.info({ event: 'staff_session_denied', reason: 'identity_unavailable' })
        reply.code(403).send({ error: 'Identity unavailable' })
        return null
      }
      return String(identity.identity_id)
    } catch {
      request.log.warn({ event: 'auth_session_database_unavailable' }, 'Session unavailable')
      reply.code(503).send({ error: 'Session unavailable' })
      return null
    }
  }
}
