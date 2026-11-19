import type { AuthDependencies } from '../../shared/auth/staff-session.js'
import { staffInviteEmail, staffSignInEmail } from '../../shared/integrations/email/access-email.js'

/** Mailer + admin origin, or null when access e-mails are not configured (admin falls back). */
export function accessMail(dependencies: AuthDependencies) {
  const { mailer, staffDirectory } = dependencies
  if (!mailer || !staffDirectory || !dependencies.adminOrigin) return null
  let origin: URL
  try {
    origin = new URL(dependencies.adminOrigin)
  } catch {
    return null
  }
  const local = origin.hostname === 'localhost' && process.env.NODE_ENV !== 'production'
  if (origin.protocol !== 'https:' && !local) return null
  const base = origin.origin
  // The login page completes the e-mail link (isSignInWithEmailLink) on return.
  const continueUrl = `${base}/login?acesso=link`
  const logoUrl = `${base}/brand/logo-letter-default.png`
  return {
    async invite(input: { email: string; name: string; clinicName: string; role: string }) {
      const link = await staffDirectory.signInLink(input.email, continueUrl)
      if (!link) throw new Error('Link unavailable')
      await mailer.send(staffInviteEmail({ ...input, to: input.email, link, logoUrl }))
    },
    /** Sends only to existing, enabled accounts; returns silently otherwise. */
    async signIn(email: string) {
      const link = await staffDirectory.signInLink(email, continueUrl, { existingOnly: true })
      if (link) await mailer.send(staffSignInEmail({ to: email, link, logoUrl }))
    },
  }
}
