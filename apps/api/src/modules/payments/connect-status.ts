import type { FastifyBaseLogger } from 'fastify'
import type { SqlConnection } from '../../shared/database/migrations.js'
import { connectStatusEmail } from '../../shared/integrations/email/clinic-emails.js'
import { adminUrl, sendLater, type ClinicMail } from '../notifications/clinic-mail.js'
import { connectReady, type ConnectStatus } from './stripe-connect.js'

// Last Stripe status of a clinic's account, saved for the panel and the notices (ADR-041).

/** Sent to Stripe with nothing left to fill: the space setup may go on while Stripe reviews. */
export function connectSubmitted(status: ConnectStatus) {
  return status.requirementsDue === 0 && ['pending', 'reviewing', 'active'].includes(status.state)
}

/**
 * Saves what Stripe said and, once per answer (approved, needs info, not approved), e-mails the
 * owner with a button to "Receber pelo app". Never throws: a failure only skips the notice.
 */
export async function syncConnectStatus(
  database: SqlConnection,
  mail: ClinicMail | undefined,
  accountId: string,
  status: ConnectStatus,
  log: FastifyBaseLogger,
) {
  try {
    const row = (
      await database.query('SELECT luminix.record_connect_status($1, $2, $3, $4) AS result', [
        accountId,
        status.state,
        connectReady(status),
        status.requirementsDue,
      ])
    ).rows[0]?.result as
      | {
          notice: string
          send: 'approved' | 'needs_info' | 'restricted' | null
          clinicName?: string
          clinicRef?: string
          ownerName?: string | null
          ownerEmail?: string | null
        }
      | null
      | undefined
    if (!row) return null
    if (row.send && row.ownerEmail) {
      const pageUrl = adminUrl(mail, `/c/${row.clinicRef}/recebimentos`)
      if (pageUrl)
        sendLater(
          mail,
          connectStatusEmail({
            to: row.ownerEmail,
            ownerName: row.ownerName ?? '',
            clinicName: row.clinicName ?? '',
            kind: row.send,
            pageUrl,
          }),
          log,
        )
    }
    return row.notice
  } catch {
    log.warn({ event: 'connect_status_record_failed' })
    return null
  }
}
