import type { FastifyInstance } from 'fastify'

import { passwordResetEmail } from '../../shared/integrations/email/access-email.js'
import type { Mailer } from '../../shared/integrations/email/mailer.js'
import type { StaffDirectory } from '../../shared/integrations/firebase/staff-directory.js'

type Area = 'gestao' | 'cliente'

/** HTTPS origin (localhost only outside production), or null. */
function safeOrigin(raw: string | undefined) {
  if (!raw) return null
  try {
    const url = new URL(raw)
    const local = url.hostname === 'localhost' && process.env.NODE_ENV !== 'production'
    return url.protocol === 'https:' || local ? url.origin : null
  } catch {
    return null
  }
}

/** Our own page that sets the new password: the admin for the team, the site for clients. */
export function passwordResetUrl(area: Area, code: string, adminOrigin: string | undefined) {
  const dev = process.env.NODE_ENV !== 'production'
  const origin =
    area === 'gestao'
      ? safeOrigin(adminOrigin || (dev ? 'http://localhost:3000' : undefined))
      : safeOrigin(
          process.env.PUBLIC_CLINIC_WEB_ORIGIN || (dev ? 'http://localhost:3001' : undefined),
        )
  if (!origin) return null
  const path = area === 'gestao' ? '/nova-senha' : '/cliente/nova-senha'
  return `${origin}${path}?oobCode=${encodeURIComponent(code)}`
}

/**
 * "Esqueci a senha" for the team (admin) and clients (site and app). Public, under /client/ so
 * the site and the app reach it with the client-area CORS. Always 202 for a well-formed request,
 * whether or not the account exists; the e-mail goes out after the answer, so timing reveals
 * nothing either. 503 only when Luminix's own e-mail is not configured: the caller then falls
 * back to Firebase's e-mail.
 */
export async function passwordResetRoutes(
  app: FastifyInstance,
  dependencies: { mailer?: Mailer; staffDirectory?: StaffDirectory; adminOrigin?: string },
) {
  const attempts = new Map<string, { count: number; until: number }>()
  const limited = (key: string, max: number) => {
    const now = Date.now()
    for (const [entry, value] of attempts) if (value.until <= now) attempts.delete(entry)
    const current = attempts.get(key)
    if ((current?.count ?? 0) >= max || (!current && attempts.size >= 10_000)) return true
    attempts.set(key, { count: (current?.count ?? 0) + 1, until: current?.until ?? now + 60_000 })
    return false
  }

  app.post<{ Body: { email: string; area: Area } }>(
    '/client/password-reset',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['email', 'area'],
          properties: {
            email: {
              type: 'string',
              minLength: 3,
              maxLength: 254,
              pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
            },
            area: { type: 'string', enum: ['gestao', 'cliente'] },
          },
        },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store')
      const email = request.body.email.trim().toLowerCase()
      // Per IP, and per address so nobody floods one inbox from many IPs.
      if (limited(`ip:${request.ip}`, 10) || limited(`to:${email}`, 3))
        return reply.code(429).header('Retry-After', '60').send({ error: 'Too many requests' })
      const { mailer, staffDirectory } = dependencies
      if (!mailer || !staffDirectory?.passwordReset)
        return reply.code(503).send({ error: 'E-mail unavailable' })
      const passwordReset = staffDirectory.passwordReset.bind(staffDirectory)
      const area = request.body.area
      reply.code(202).send({ sent: true })
      void (async () => {
        try {
          const reset = await passwordReset(email)
          if (!reset) return
          const link = passwordResetUrl(area, reset.code, dependencies.adminOrigin)
          if (!link) throw new Error('Reset page origin unavailable')
          await mailer.send(passwordResetEmail({ to: email, name: reset.name, link, area }))
          request.log.info({ event: 'password_reset_sent', area })
        } catch (error) {
          request.log.warn(
            { event: 'password_reset_unavailable', err: (error as Error)?.message },
            'Password reset e-mail not sent',
          )
        }
      })()
      return reply
    },
  )
}
