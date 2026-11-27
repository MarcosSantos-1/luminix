import type { FastifyBaseLogger } from 'fastify'
import type { SqlConnection } from '../../shared/database/migrations.js'
import type { OnlinePaymentsProvider } from './online-checkout.js'

// Refund queue of payments made in the app (ADR-040, etapa 2). Database marks what is due
// (claim_due_refunds / staff_request_refund); Stripe is called outside any transaction; the
// result is written by finish_refund. A failure stays "failed" and the team can retry.

export type RefundRow = {
  clinic_id: string
  payment_id: string
  account_id: string
  session_id: string
  payment_intent_id: string | null
  amount_cents: number
  /** What Stripe should return now. Omitted on older rows: the whole payment. */
  refund_cents?: number | null
}

export async function settleRefunds(
  database: SqlConnection,
  provider: OnlinePaymentsProvider,
  rows: RefundRow[],
  log: FastifyBaseLogger,
) {
  let refunded = 0
  for (const row of rows) {
    let refundId: string | null = null
    try {
      const amount = Number(row.refund_cents ?? row.amount_cents)
      refundId = await provider.refund({
        account: String(row.account_id),
        paymentId: String(row.payment_id),
        intent: row.payment_intent_id ? String(row.payment_intent_id) : null,
        session: String(row.session_id),
        ...(amount > 0 ? { amount } : {}),
      })
    } catch {
      log.warn({ event: 'online_refund_failed' })
    }
    await database.query('SELECT luminix.finish_refund($1::uuid, $2::uuid, $3, $4)', [
      row.clinic_id,
      row.payment_id,
      refundId,
      Boolean(refundId),
    ])
    if (refundId) refunded += 1
  }
  return refunded
}

/** Refunds every canceled or late paid visit of one clinic (id or space code). */
export async function refundDue(
  database: SqlConnection,
  provider: OnlinePaymentsProvider | null,
  clinicRef: string,
  log: FastifyBaseLogger,
) {
  if (!provider) return 0
  try {
    const due = await database.query('SELECT * FROM luminix.claim_due_refunds($1)', [clinicRef])
    if (!due.rows.length) return 0
    return await settleRefunds(database, provider, due.rows as RefundRow[], log)
  } catch {
    log.warn({ event: 'online_refund_queue_unavailable' })
    return 0
  }
}
