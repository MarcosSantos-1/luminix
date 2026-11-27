/**
 * Money of client packages seen from an appointment or from the Financeiro.
 *
 * A package session is booked with price 0 (the debt lives in the package, ADR-032 / 0060), so
 * the appointment alone looks "free". These helpers bring the package back into view: which
 * session it is (2/4), how it is paid and what is still owed.
 */

import type { SqlConnection } from '../../shared/database/migrations.js'

export async function lockPackagePayment(
  connection: SqlConnection,
  clinicId: string,
  packageId: string,
) {
  await connection.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    clinicId + '/package-payment/' + packageId.toLowerCase(),
  ])
}

/** jsonb with the package of the appointment (alias "a"), or NULL. */
export const appointmentPackage = `(SELECT jsonb_build_object(
    'id', cp.id,
    'name', cp.name,
    'kind', cp.kind,
    'plan', cp.payment_plan,
    'total', CASE WHEN cp.kind = 'combo' THEN cp.sessions_total
                  ELSE coalesce(pi.sessions, cp.sessions_total) END,
    'sessionsTotal', cp.sessions_total,
    'session', (SELECT count(*)::integer FROM luminix.appointments v
                 WHERE v.clinic_id = a.clinic_id AND v.client_package_id = a.client_package_id
                   AND (cp.kind = 'combo' OR v.service_id = a.service_id)
                   AND v.status IN ('scheduled', 'confirmed', 'completed', 'no_show')
                   AND (v.starts_at, v.id) <= (a.starts_at, a.id)),
    'completed', a.status = 'completed',
    'done', (SELECT count(*)::integer FROM luminix.appointments v
              WHERE v.clinic_id = a.clinic_id AND v.client_package_id = a.client_package_id
                AND v.status = 'completed'),
    'priceCents', cp.price_cents,
    'paidCents', luminix.client_package_paid(cp.clinic_id, cp.id),
    'visitPaidCents', (SELECT coalesce(sum(f.amount_cents), 0)::integer
                         FROM luminix.client_package_payments pp
                         JOIN luminix.finance_entries f
                           ON f.clinic_id = pp.clinic_id AND f.id = pp.finance_entry_id
                        WHERE pp.clinic_id = a.clinic_id AND pp.appointment_id = a.id
                          AND f.status = 'active'))
   FROM luminix.client_packages cp
   LEFT JOIN luminix.client_package_items pi ON pi.clinic_id = cp.clinic_id
     AND pi.client_package_id = cp.id AND pi.service_id = a.service_id
  WHERE cp.clinic_id = a.clinic_id AND cp.id = a.client_package_id)`

export type AppointmentPackage = {
  id: string
  name: string
  kind: 'combo' | 'sessions'
  plan: 'paid' | 'per_visit' | 'later' | 'installments'
  session: number
  firstUnfinished: boolean
  total: number
  /** Money fields are null for who does not see money. */
  priceCents: number | null
  paidCents: number | null
  remainingCents: number | null
  installmentCents: number | null
  /** Paid at this visit (installments linked to the appointment). */
  visitPaidCents: number | null
  /** What should be charged at this visit: the installment ("a cada sessão") or the whole rest. */
  dueNowCents: number | null
}

/** Shapes the jsonb from {@link appointmentPackage}; money only with finance:manage. */
export function packageView(raw: unknown, seesMoney: boolean): AppointmentPackage | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const price = Number(row.priceCents ?? 0)
  const paid = Number(row.paidCents ?? 0)
  const sessionsTotal = Math.max(1, Number(row.sessionsTotal ?? 1))
  const remaining = Math.max(0, price - paid)
  const done = Number(row.done ?? 0)
  const next = Math.min(sessionsTotal, done + (row.completed ? 0 : 1))
  const scheduled = (visits: number) => Math.floor((price * visits) / sessionsTotal)
  const installment = scheduled(next) - scheduled(Math.max(0, next - 1))
  const visitPaid = Number(row.visitPaidCents ?? 0)
  const plan =
    row.plan === 'per_visit' || row.plan === 'later' || row.plan === 'installments'
      ? row.plan
      : 'paid'
  const dueNow =
    plan === 'per_visit' ? Math.min(remaining, Math.max(0, scheduled(next) - paid)) : remaining
  return {
    id: String(row.id),
    name: String(row.name),
    kind: row.kind === 'combo' ? 'combo' : 'sessions',
    plan,
    session: Number(row.session ?? 0),
    firstUnfinished: done === 0,
    total: Number(row.total ?? sessionsTotal),
    priceCents: seesMoney ? price : null,
    paidCents: seesMoney ? paid : null,
    remainingCents: seesMoney ? remaining : null,
    installmentCents: seesMoney ? installment : null,
    visitPaidCents: seesMoney ? visitPaid : null,
    dueNowCents: seesMoney ? dueNow : null,
  }
}

/**
 * Packages with money owed today: "a cada sessão" behind on the sessions already done, or
 * "paga depois"/"pago" with a balance once the client has started using it. Clinic in $1.
 */
export const packagesDueQuery = `SELECT cp.id, cp.name, cp.payment_plan, cp.price_cents, cp.sessions_total,
       cp.clinic_client_id AS client_id, c.display_name AS client, cp.sold_on::text AS sold_on,
       luminix.client_package_paid(cp.clinic_id, cp.id) AS paid_cents,
       (SELECT count(*)::integer FROM luminix.appointments a
         WHERE a.clinic_id = cp.clinic_id AND a.client_package_id = cp.id
           AND a.status = 'completed') AS done
  FROM luminix.client_packages cp
  JOIN luminix.clinic_clients c ON c.clinic_id = cp.clinic_id AND c.id = cp.clinic_client_id
 WHERE cp.clinic_id = $1 AND cp.status <> 'canceled' AND cp.price_cents > 0
   AND luminix.client_package_paid(cp.clinic_id, cp.id) < cp.price_cents
 ORDER BY cp.sold_on, cp.id LIMIT 100`

export type PackageDue = {
  clientPackageId: string
  clientId: string
  client: string
  name: string
  plan: string
  priceCents: number
  paidCents: number
  /** Owed now (late), and the whole open balance. */
  dueCents: number
  remainingCents: number
  done: number
  sessionsTotal: number
  soldOn: string
}

export function packagesDue(rows: Record<string, unknown>[]): PackageDue[] {
  return rows
    .map((row) => {
      const price = Number(row.price_cents ?? 0)
      const paid = Number(row.paid_cents ?? 0)
      const total = Math.max(1, Number(row.sessions_total ?? 1))
      const done = Number(row.done ?? 0)
      const remaining = Math.max(0, price - paid)
      const expected =
        row.payment_plan === 'per_visit'
          ? Math.floor((price * Math.min(total, done)) / total)
          : done > 0
            ? price
            : 0
      return {
        clientPackageId: String(row.id),
        clientId: String(row.client_id),
        client: String(row.client),
        name: String(row.name),
        plan: String(row.payment_plan),
        priceCents: price,
        paidCents: paid,
        dueCents: Math.min(remaining, Math.max(0, expected - paid)),
        remainingCents: remaining,
        done,
        sessionsTotal: total,
        soldOn: String(row.sold_on),
      }
    })
    .filter((item) => item.dueCents > 0)
}
