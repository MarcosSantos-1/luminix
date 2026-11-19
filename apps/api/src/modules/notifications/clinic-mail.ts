import type { FastifyBaseLogger } from 'fastify'
import type { SqlConnection } from '../../shared/database/migrations.js'
import type { ClinicContact } from '../../shared/integrations/email/client-emails.js'
import type { Mailer, OutgoingEmail } from '../../shared/integrations/email/mailer.js'
import { accessMailFailure } from '../team/access-mail.js'

/** What clinic and client routes need to send e-mails after commit. */
export type ClinicMail = {
  mailer?: Mailer
  /** https://app.luminix.beauty: panel links. */
  adminOrigin?: string
}

function httpsOrigin(value: string | undefined) {
  if (!value) return null
  try {
    const url = new URL(value)
    const local = url.hostname === 'localhost' && process.env.NODE_ENV !== 'production'
    return url.protocol === 'https:' || local ? url.origin : null
  } catch {
    return null
  }
}

export function adminUrl(mail: ClinicMail | undefined, path: string) {
  const origin = httpsOrigin(mail?.adminOrigin)
  return origin ? `${origin}${path}` : null
}

/**
 * Space data shown in e-mails, read inside the request's tenant transaction. Address and
 * WhatsApp follow what the space chose to publish on its page.
 */
export async function loadClinicContact(
  connection: SqlConnection,
  clinicId: string,
): Promise<ClinicContact & { ownerName: string; ownerEmail: string | null; code: string | null }> {
  const row = (
    await connection.query(
      `SELECT c.name, c.slug, c.share_code, p.owner_name, p.contact_email, p.whatsapp_phone,
              p.public_enabled, p.public_address, p.public_contacts,
              l.address_line, l.address_number, l.city, l.state
         FROM luminix.clinics c
         LEFT JOIN luminix.clinic_profiles p ON p.clinic_id = c.id
         LEFT JOIN LATERAL (
           SELECT address_line, address_number, city, state FROM luminix.locations
            WHERE clinic_id = c.id ORDER BY is_primary DESC LIMIT 1
         ) l ON true
        WHERE c.id = $1`,
      [clinicId],
    )
  ).rows[0]
  const site = httpsOrigin(process.env.PUBLIC_CLINIC_WEB_ORIGIN)
  const street = [row?.address_line, row?.address_number].filter(Boolean).join(', ')
  const town = [row?.city, row?.state].filter(Boolean).join(' - ')
  const address = [street, town].filter(Boolean).join(' · ')
  return {
    clinicName: String(row?.name ?? ''),
    siteUrl: row?.public_enabled && site && row.slug ? `${site}/c/${String(row.slug)}` : null,
    appCode: row?.share_code ? String(row.share_code) : null,
    code: row?.share_code ? String(row.share_code) : null,
    whatsapp: row?.public_contacts && row.whatsapp_phone ? String(row.whatsapp_phone) : null,
    address: row?.public_address && address ? address : null,
    replyTo: row?.contact_email ? String(row.contact_email) : null,
    ownerName: String(row?.owner_name ?? ''),
    ownerEmail: row?.contact_email ? String(row.contact_email) : null,
  }
}

/** After commit, without holding the response: a failed e-mail is logged, never surfaced. */
export function sendLater(
  mail: ClinicMail | undefined,
  email: OutgoingEmail | null,
  log: FastifyBaseLogger,
) {
  if (!mail?.mailer || !email) return
  void mail.mailer
    .send(email)
    .catch((error) =>
      log.warn({
        event: 'notification_email_failed',
        kind: email.tag,
        cause: accessMailFailure(error),
      }),
    )
}
