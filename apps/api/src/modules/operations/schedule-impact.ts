import type { FastifyBaseLogger } from 'fastify'
import type { SqlConnection } from '../../shared/database/migrations.js'
import { appointmentCanceledBySpaceEmail } from '../../shared/integrations/email/client-emails.js'
import type { OutgoingEmail } from '../../shared/integrations/email/mailer.js'
import { clientPhotoUrl } from '../clinics/media-storage.js'
import { loadClinicContact, sendLater, type ClinicMail } from '../notifications/clinic-mail.js'

/**
 * Cancelamentos por mudança de agenda (ADR-035). A route that changes hours, closes days or
 * makes a rental day exclusive:
 *   1. reads which future appointments fit the agenda (`fittingAppointments`) before the change;
 *   2. applies the change in the same transaction;
 *   3. calls `settleScheduleImpact`. Appointments that fit before and no longer fit are the
 *      affected ones. Without `confirmCancellations` the transaction is rolled back and the API
 *      answers 409 with the list (photo, name, phone and times) for the confirmation dialog.
 *      With it, they are canceled and each client gets an e-mail after commit and a notice in
 *      the client area (status canceled + cancellation_origin).
 * Appointments the manager placed outside the hours on purpose never "fit", so they are never
 * canceled by a later change.
 */

export const confirmCancellationsSchema = { type: 'boolean' } as const

export type AffectedClient = {
  clientId: string
  name: string
  phone: string | null
  photoUrl: string | null
  appointments: {
    id: string
    startsAt: string
    endsAt: string
    date: string
    time: string
    service: string
    professional: string | null
  }[]
}

/** Thrown inside the tenant transaction so it rolls back; the route answers 409 with `responseBody`. */
export class ScheduleImpactError extends Error {
  readonly statusCode = 409
  readonly code = 'schedule_impact'
  constructor(readonly responseBody: { error: string; affected: AffectedClient[]; total: number }) {
    super('Schedule impact')
  }
}

export async function fittingAppointments(connection: SqlConnection, clinicId: string) {
  const { rows } = await connection.query(
    'SELECT appointment_id FROM luminix.schedule_fitting_appointments($1)',
    [clinicId],
  )
  return new Set(rows.map((row) => String(row.appointment_id)))
}

/** "sexta-feira, 27 de novembro" for a local YYYY-MM-DD. */
const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })

/**
 * Compares with `before`, then either throws the confirmation (409) or cancels. Returns the
 * e-mails to send after commit (`sendCancellationEmails`) and how many were canceled.
 */
export async function settleScheduleImpact(
  connection: SqlConnection,
  clinicId: string,
  before: Set<string>,
  options: { confirm: boolean; reason: string; permission: string },
): Promise<{ canceled: number; emails: OutgoingEmail[] }> {
  if (!before.size) return { canceled: 0, emails: [] }
  const after = await fittingAppointments(connection, clinicId)
  const ids = [...before].filter((id) => !after.has(id))
  if (!ids.length) return { canceled: 0, emails: [] }
  const { rows } = await connection.query(
    `SELECT a.id, a.starts_at, a.ends_at, a.clinic_client_id, c.display_name, c.contact_phone,
            c.contact_email, s.name AS service_name, p.display_name AS professional_name,
            to_char(a.starts_at AT TIME ZONE z.tz, 'YYYY-MM-DD') AS local_date,
            to_char(a.starts_at AT TIME ZONE z.tz, 'HH24:MI') AS local_time,
            (SELECT m.small_object_key FROM luminix.media_assets m
              WHERE m.clinic_id = c.clinic_id AND m.id = c.photo_asset_id
                AND m.status = 'ready') AS photo_key
       FROM luminix.appointments a
       CROSS JOIN LATERAL (SELECT coalesce((SELECT timezone FROM luminix.clinic_settings
         WHERE clinic_id = a.clinic_id), 'America/Sao_Paulo') AS tz) z
       JOIN luminix.clinic_clients c ON c.clinic_id = a.clinic_id AND c.id = a.clinic_client_id
       JOIN luminix.services s ON s.clinic_id = a.clinic_id AND s.id = a.service_id
       LEFT JOIN luminix.professionals p ON p.clinic_id = a.clinic_id AND p.id = a.professional_id
      WHERE a.clinic_id = $1 AND a.id = ANY($2::uuid[])
      ORDER BY a.starts_at, a.id`,
    [clinicId, ids],
  )
  if (!options.confirm) {
    const clients = new Map<string, AffectedClient>()
    for (const row of rows) {
      const clientId = String(row.clinic_client_id)
      let client = clients.get(clientId)
      if (!client) {
        client = {
          clientId,
          name: String(row.display_name),
          phone: row.contact_phone ? String(row.contact_phone) : null,
          photoUrl: await clientPhotoUrl(row.photo_key as string | null),
          appointments: [],
        }
        clients.set(clientId, client)
      }
      client.appointments.push({
        id: String(row.id),
        startsAt: new Date(String(row.starts_at)).toISOString(),
        endsAt: new Date(String(row.ends_at)).toISOString(),
        date: String(row.local_date),
        time: String(row.local_time),
        service: String(row.service_name),
        professional: row.professional_name ? String(row.professional_name) : null,
      })
    }
    throw new ScheduleImpactError({
      error: 'Schedule impact',
      affected: [...clients.values()],
      total: rows.length,
    })
  }
  const canceled = Number(
    (
      await connection.query(
        'SELECT luminix.cancel_for_schedule_change($1, $2::uuid[], $3, $4) AS total',
        [clinicId, ids, options.reason.slice(0, 300), options.permission],
      )
    ).rows[0]?.total ?? 0,
  )
  const withEmail = rows.filter((row) => row.contact_email)
  if (!withEmail.length) return { canceled, emails: [] }
  const contact = await loadClinicContact(connection, clinicId)
  const emails = withEmail.map((row) =>
    appointmentCanceledBySpaceEmail({
      ...contact,
      to: String(row.contact_email),
      clientName: String(row.display_name),
      serviceName: String(row.service_name),
      professionalName: row.professional_name ? String(row.professional_name) : null,
      dateLabel: dateLabel(String(row.local_date)),
      timeLabel: String(row.local_time),
      priceLabel: null,
      reason: options.reason || null,
    }),
  )
  return { canceled, emails }
}

/** After commit; each failure is logged and never reaches the manager. */
export function sendCancellationEmails(
  mail: ClinicMail | undefined,
  emails: OutgoingEmail[],
  log: FastifyBaseLogger,
) {
  for (const email of emails) sendLater(mail, email, log)
}

/**
 * Wraps a route handler: collects the cancellation e-mails produced inside the transaction and
 * sends them only when the handler finished without an error status (i.e. after commit).
 */
export async function withCancellationMail<T>(
  mail: ClinicMail | undefined,
  reply: { statusCode: number; log: FastifyBaseLogger },
  run: (outbox: OutgoingEmail[]) => Promise<T>,
): Promise<T> {
  const outbox: OutgoingEmail[] = []
  const result = await run(outbox)
  if (reply.statusCode < 400 && outbox.length) sendCancellationEmails(mail, outbox, reply.log)
  return result
}
