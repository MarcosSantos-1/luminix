import type { FastifyInstance } from 'fastify'
import {
  clinicRefParams,
  createAuthorizedRoute,
  type Authenticate,
} from '../../shared/tenant/authorized-route.js'
import type { TenantPool } from '../../shared/tenant/clinic-transaction.js'
import {
  clinicItemParams,
  dateSchema,
  isoDate,
  toNumber,
  uuidSchema,
} from '../../shared/tenant/route-helpers.js'

const monthPattern = '^[0-9]{4}-(0[1-9]|1[0-2])$'

/**
 * Manual ledger (entradas e saídas) plus estimates from appointments. Card/Pix charges through
 * Stripe are not reconciled here yet (TD-008); the ledger is what the clinic records.
 */
export async function financeRoutes(
  app: FastifyInstance,
  authenticate: Authenticate,
  pool: TenantPool | undefined,
) {
  const authorized = createAuthorizedRoute(authenticate, pool)

  app.get<{ Params: { clinicId: string }; Querystring: { month?: string } }>(
    '/clinics/:clinicId/finance',
    {
      schema: {
        params: clinicRefParams,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { month: { type: 'string', pattern: monthPattern } },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'finance:manage', async (connection, tenant) => {
        const today = isoDate(
          (await connection.query('SELECT luminix.clinic_today() AS today')).rows[0]?.today,
        )!
        const month = request.query.month ?? today.slice(0, 7)
        const first = `${month}-01`
        const [entries, totals, pending, forecast] = await Promise.all([
          connection.query(
            `SELECT e.id, e.kind, e.amount_cents, e.occurred_on, e.description, e.category, e.method,
                    e.appointment_id, e.created_at
               FROM luminix.finance_entries e
              WHERE e.clinic_id = $1 AND e.status = 'active'
                AND e.occurred_on >= $2::date AND e.occurred_on < ($2::date + interval '1 month')
              ORDER BY e.occurred_on DESC, e.created_at DESC LIMIT 500`,
            [tenant.clinicId, first],
          ),
          connection.query(
            `SELECT coalesce(sum(amount_cents) FILTER (WHERE kind = 'income'), 0) AS income,
                    coalesce(sum(amount_cents) FILTER (WHERE kind = 'expense'), 0) AS expense
               FROM luminix.finance_entries
              WHERE clinic_id = $1 AND status = 'active'
                AND occurred_on >= $2::date AND occurred_on < ($2::date + interval '1 month')`,
            [tenant.clinicId, first],
          ),
          // Completed appointments without an income entry yet ("a lançar").
          connection.query(
            `SELECT a.id, a.starts_at, a.price_cents, c.display_name AS client, s.name AS service
               FROM luminix.appointments a
               JOIN luminix.clinic_clients c ON c.clinic_id = a.clinic_id AND c.id = a.clinic_client_id
               JOIN luminix.services s ON s.clinic_id = a.clinic_id AND s.id = a.service_id
              WHERE a.clinic_id = $1 AND a.status = 'completed'
                AND a.starts_at > now() - interval '60 days'
                AND NOT EXISTS (SELECT 1 FROM luminix.finance_entries e WHERE e.clinic_id = a.clinic_id
                  AND e.appointment_id = a.id AND e.status = 'active')
              ORDER BY a.starts_at DESC LIMIT 50`,
            [tenant.clinicId],
          ),
          connection.query(
            `SELECT coalesce(sum(price_cents), 0) AS cents, count(*) AS appointments
               FROM luminix.appointments
              WHERE clinic_id = $1 AND status IN ('scheduled', 'confirmed') AND starts_at >= now()
                AND (starts_at AT TIME ZONE 'America/Sao_Paulo') < ($2::date + interval '1 month')`,
            [tenant.clinicId, first],
          ),
        ])
        const income = toNumber(totals.rows[0]?.income)
        const expense = toNumber(totals.rows[0]?.expense)
        return {
          month,
          today,
          totals: { incomeCents: income, expenseCents: expense, balanceCents: income - expense },
          forecast: {
            cents: toNumber(forecast.rows[0]?.cents),
            appointments: toNumber(forecast.rows[0]?.appointments),
          },
          entries: entries.rows.map((row) => ({
            id: String(row.id),
            kind: row.kind,
            amountCents: Number(row.amount_cents),
            occurredOn: isoDate(row.occurred_on),
            description: String(row.description),
            category: row.category ? String(row.category) : '',
            method: row.method ?? null,
            appointmentId: row.appointment_id ? String(row.appointment_id) : null,
          })),
          pending: pending.rows.map((row) => ({
            appointmentId: String(row.id),
            startsAt: new Date(String(row.starts_at)).toISOString(),
            priceCents: toNumber(row.price_cents),
            client: String(row.client),
            service: String(row.service),
          })),
        }
      }),
  )

  app.post<{ Params: { clinicId: string }; Body: Record<string, unknown> }>(
    '/clinics/:clinicId/finance/entries',
    {
      schema: {
        params: clinicRefParams,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'amountCents', 'occurredOn', 'description'],
          properties: {
            kind: { type: 'string', enum: ['income', 'expense'] },
            amountCents: { type: 'integer', minimum: 1, maximum: 100000000 },
            occurredOn: dateSchema,
            description: { type: 'string', minLength: 1, maxLength: 160 },
            category: { type: 'string', maxLength: 60 },
            method: {
              type: 'string',
              enum: ['pix', 'cash', 'credit', 'debit', 'transfer', 'other'],
            },
            appointmentId: uuidSchema,
          },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'finance:manage', async (connection, tenant) => {
        const id = (
          await connection.query('SELECT luminix.save_finance_entry($1::uuid, $2::jsonb) AS id', [
            tenant.clinicId,
            JSON.stringify(request.body),
          ])
        ).rows[0]?.id
        return { id: String(id) }
      }),
  )

  app.post<{ Params: { clinicId: string; entryId: string }; Body: Record<string, never> }>(
    '/clinics/:clinicId/finance/entries/:entryId/void',
    {
      schema: {
        params: clinicItemParams('entryId'),
        body: { type: 'object', additionalProperties: false },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'finance:manage', async (connection, tenant) => {
        await connection.query('SELECT luminix.void_finance_entry($1::uuid, $2::uuid)', [
          tenant.clinicId,
          request.params.entryId,
        ])
        return { voided: true }
      }),
  )
}
