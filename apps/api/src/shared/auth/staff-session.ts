import type { BillingProvider } from '../../modules/billing/provider.js'
import type { OnlinePaymentsProvider } from '../../modules/payments/online-checkout.js'
import type { FastifyReply, FastifyRequest } from 'fastify'

import type { SqlConnection } from '../database/migrations.js'
import type { TenantPool } from '../tenant/clinic-transaction.js'

import type { ConnectProvider } from '../../modules/payments/stripe-connect.js'
import type { StaffDirectory } from '../integrations/firebase/staff-directory.js'
import type { Mailer } from '../integrations/email/mailer.js'

export type AuthDependencies = {
  connectProvider?: ConnectProvider
  /** Stripe Billing for the Luminix subscription; null disables it (tests), absent reads env. */
  billingProvider?: BillingProvider | null
  /** Stripe Checkout on the clinic's Connect account (ADR-040); null disables, absent reads env. */
  onlinePayments?: OnlinePaymentsProvider | null
  /** Firebase accounts for staff invitations; created lazily in production. */
  staffDirectory?: StaffDirectory
  /** Access e-mails (invite, sign-in link). Absent: the admin uses Firebase's own e-mail. */
  mailer?: Mailer
  /** Public origin of the admin (https://app.luminix.beauty): link return and e-mail logo. */
  adminOrigin?: string
  verifyToken(token: string): Promise<{ uid: string }>
  database: SqlConnection
  tenantPool?: TenantPool
}

export function createStaffAuthenticator(
  dependencies: AuthDependencies,
  perMinute = 30,
  verifiedPerMinute?: number,
) {
  // Bounded, per-process protection. Never trust forwarding headers for the rate key.
  const attempts = new Map<string, { count: number; until: number }>()
  const sessions = new Map<string, { count: number; until: number }>()
  return async (request: FastifyRequest, reply: FastifyReply): Promise<string | null> => {
    reply.header('Cache-Control', 'no-store')
    const now = Date.now()
    for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key)
    const attempt = attempts.get(request.ip)
    if ((attempt?.count ?? 0) >= perMinute || (!attempt && attempts.size >= 10_000)) {
      reply.code(429).header('Retry-After', '60').send({ error: 'Too many requests' })
      return null
    }
    const pending = attempt ?? { count: 0, until: now + 60_000 }
    pending.count += 1
    attempts.set(request.ip, pending)
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
    if (verifiedPerMinute !== undefined) {
      // A proxy may put an entire clinic behind one IP. Count valid sessions by UID.
      pending.count -= 1
      if (pending.count === 0 && attempts.get(request.ip) === pending) attempts.delete(request.ip)
      for (const [key, value] of sessions) if (value.until <= now) sessions.delete(key)
      const session = sessions.get(uid) ?? { count: 0, until: now + 60_000 }
      if (session.count >= verifiedPerMinute || (!sessions.has(uid) && sessions.size >= 10_000)) {
        reply.code(429).header('Retry-After', '60').send({ error: 'Too many requests' })
        return null
      }
      session.count += 1
      sessions.set(uid, session)
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
