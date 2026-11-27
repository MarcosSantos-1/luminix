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

import { packagesDue, packagesDueQuery } from '../catalog/package-money.js'

const monthPattern = '^[0-9]{4}-(0[1-9]|1[0-2])$'

/**
 * Manual ledger (entradas e saídas), recurring bills (contas fixas) and estimates crossed from
 * the agenda and the stock. Card/Pix charges through
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
        const [
          entries,
          totals,
          pending,
          forecast,
          bills,
          categories,
          trend,
          topClients,
          courtesy,
          stock,
          stockUsed,
          packages,
          team,
        ] = await Promise.all([
          connection.query(
            `SELECT e.id, e.kind, e.amount_cents, e.occurred_on, e.description, e.category, e.method,
                    e.appointment_id, e.bill_id, e.created_at
               FROM luminix.finance_entries e
              WHERE e.clinic_id = $1 AND e.status = 'active'
                AND e.occurred_on >= $2::date AND e.occurred_on < ($2::date + interval '1 month')
              ORDER BY e.occurred_on DESC, e.created_at DESC LIMIT 500`,
            [tenant.clinicId, first],
          ),
          connection.query(
            `SELECT coalesce(sum(amount_cents) FILTER (WHERE kind = 'income'), 0) AS income,
                    coalesce(sum(amount_cents) FILTER (WHERE kind = 'income'
                      AND appointment_id IS NOT NULL), 0) AS income_appointments,
                    coalesce(sum(amount_cents) FILTER (WHERE kind = 'expense'), 0) AS expense,
                    coalesce(sum(amount_cents) FILTER (WHERE kind = 'expense'
                      AND bill_id IS NOT NULL), 0) AS expense_fixed
               FROM luminix.finance_entries
              WHERE clinic_id = $1 AND status = 'active'
                AND occurred_on >= $2::date AND occurred_on < ($2::date + interval '1 month')`,
            [tenant.clinicId, first],
          ),
          // Completed appointments without an income entry yet ("a lançar"). Free ones (avaliação,
          // cortesia) have nothing to receive; "a combinar" ones ask the amount when recorded.
          connection.query(
            `SELECT a.id, a.starts_at, a.price_cents, s.price_type, c.display_name AS client,
                    s.name AS service, luminix.appointment_paid_cents(a.clinic_id, a.id) AS paid_cents
               FROM luminix.appointments a
               JOIN luminix.clinic_clients c ON c.clinic_id = a.clinic_id AND c.id = a.clinic_client_id
               JOIN luminix.services s ON s.clinic_id = a.clinic_id AND s.id = a.service_id
              WHERE a.clinic_id = $1 AND a.client_package_id IS NULL AND a.status = 'completed'
                AND a.starts_at > now() - interval '60 days'
                AND (coalesce(a.price_cents, 0) > 0 OR s.price_type = 'quote')
                -- Not paid yet, or paid in part ("a combinar": until something is received).
                AND luminix.appointment_paid_cents(a.clinic_id, a.id)
                  < greatest(coalesce(a.price_cents, 0), 1)
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
          connection.query(
            `SELECT b.id, b.name, b.category, b.amount_cents, b.due_day,
                    e.id AS entry_id, e.amount_cents AS paid_cents, e.occurred_on AS paid_on
               FROM luminix.finance_bills b
               LEFT JOIN luminix.finance_entries e ON e.clinic_id = b.clinic_id AND e.bill_id = b.id
                AND e.bill_month = $2::date AND e.status = 'active'
              WHERE b.clinic_id = $1 AND b.status = 'active'
              ORDER BY b.due_day NULLS LAST, lower(b.name) LIMIT 60`,
            [tenant.clinicId, first],
          ),
          connection.query(
            `SELECT coalesce(nullif(btrim(category), ''), 'Outros') AS category,
                    sum(amount_cents) AS cents,
                    coalesce(sum(amount_cents) FILTER (WHERE bill_id IS NOT NULL), 0) AS fixed_cents
               FROM luminix.finance_entries
              WHERE clinic_id = $1 AND status = 'active' AND kind = 'expense'
                AND occurred_on >= $2::date AND occurred_on < ($2::date + interval '1 month')
              GROUP BY 1 ORDER BY 2 DESC LIMIT 12`,
            [tenant.clinicId, first],
          ),
          // The selected month and the five before it.
          connection.query(
            `SELECT to_char(m.month, 'YYYY-MM') AS month,
                    coalesce(sum(e.amount_cents) FILTER (WHERE e.kind = 'income'), 0) AS income,
                    coalesce(sum(e.amount_cents) FILTER (WHERE e.kind = 'expense'), 0) AS expense
               FROM generate_series($2::date - interval '5 months', $2::date, interval '1 month') AS m(month)
               LEFT JOIN luminix.finance_entries e ON e.clinic_id = $1 AND e.status = 'active'
                AND e.occurred_on >= m.month AND e.occurred_on < m.month + interval '1 month'
              GROUP BY m.month ORDER BY m.month`,
            [tenant.clinicId, first],
          ),
          connection.query(
            `SELECT c.display_name AS client, sum(e.amount_cents) AS cents, count(*) AS visits
               FROM luminix.finance_entries e
               JOIN luminix.appointments a ON a.clinic_id = e.clinic_id AND a.id = e.appointment_id
               JOIN luminix.clinic_clients c ON c.clinic_id = a.clinic_id AND c.id = a.clinic_client_id
              WHERE e.clinic_id = $1 AND e.status = 'active' AND e.kind = 'income'
                AND e.occurred_on >= $2::date AND e.occurred_on < ($2::date + interval '1 month')
              GROUP BY c.id ORDER BY 2 DESC LIMIT 5`,
            [tenant.clinicId, first],
          ),
          connection.query(
            `SELECT count(*) AS total FROM luminix.appointments a
               JOIN luminix.services s ON s.clinic_id = a.clinic_id AND s.id = a.service_id
              WHERE a.clinic_id = $1 AND a.status = 'completed' AND coalesce(a.price_cents, 0) = 0
                AND s.price_type <> 'quote'
                AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo') >= $2::date
                AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo') < ($2::date + interval '1 month')`,
            [tenant.clinicId, first],
          ),
          // Stock crossed with money: what is on the shelf and what restocking would cost.
          connection.query(
            `SELECT coalesce(sum(quantity / coalesce(package_size, 1) * cost_cents), 0) AS value,
                    coalesce(sum(greatest(min_quantity - quantity, 0) / coalesce(package_size, 1)
                      * cost_cents), 0) AS restock,
                    count(*) FILTER (WHERE min_quantity > 0 AND quantity <= min_quantity) AS low,
                    count(*) FILTER (WHERE cost_cents IS NULL) AS without_cost,
                    count(*) AS items
               FROM luminix.inventory_items WHERE clinic_id = $1 AND status = 'active'`,
            [tenant.clinicId],
          ),
          connection.query(
            `SELECT coalesce(sum(m.quantity / coalesce(i.package_size, 1) * i.cost_cents), 0) AS used
               FROM luminix.inventory_movements m
               JOIN luminix.inventory_items i ON i.clinic_id = m.clinic_id AND i.id = m.item_id
              WHERE m.clinic_id = $1 AND m.kind = 'out'
                AND (m.created_at AT TIME ZONE 'America/Sao_Paulo') >= $2::date
                AND (m.created_at AT TIME ZONE 'America/Sao_Paulo') < ($2::date + interval '1 month')`,
            [tenant.clinicId, first],
          ),
          // Packages with installments behind (sold "a cada sessão" or "paga depois").
          connection.query(packagesDueQuery, [tenant.clinicId]),
          connection.query('SELECT * FROM luminix.finance_team_month($1, $2::date)', [
            tenant.clinicId,
            first,
          ]),
        ])
        const income = toNumber(totals.rows[0]?.income)
        const expense = toNumber(totals.rows[0]?.expense)
        return {
          month,
          today,
          totals: {
            incomeCents: income,
            incomeAppointmentsCents: toNumber(totals.rows[0]?.income_appointments),
            expenseCents: expense,
            expenseFixedCents: toNumber(totals.rows[0]?.expense_fixed),
            balanceCents: income - expense,
          },
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
            billId: row.bill_id ? String(row.bill_id) : null,
          })),
          packagesDue: packagesDue(packages.rows),
          team: team.rows.map((row) => ({
            id: String(row.recipient_id),
            name: String(row.name),
            professional: row.professional === true,
            baseCents: toNumber(row.base_cents),
            paid: row.entry_id
              ? {
                  salaryCents: toNumber(row.salary_cents),
                  commissionCents: toNumber(row.commission_cents),
                  commissionBps: toNumber(row.commission_bps),
                  date: isoDate(row.paid_on),
                }
              : null,
          })),
          pending: pending.rows.map((row) => ({
            appointmentId: String(row.id),
            startsAt: new Date(String(row.starts_at)).toISOString(),
            // What is still missing (the whole price, or the rest of a partial payment).
            priceCents: toNumber(row.price_cents) - toNumber(row.paid_cents),
            paidCents: toNumber(row.paid_cents),
            // "A combinar": there is no agreed price yet, the amount is typed when recording.
            quote: row.price_type === 'quote' && toNumber(row.price_cents) === 0,
            client: String(row.client),
            service: String(row.service),
          })),
          bills: bills.rows.map((row) => ({
            id: String(row.id),
            name: String(row.name),
            category: String(row.category),
            amountCents: toNumber(row.amount_cents),
            dueDay: row.due_day == null ? null : Number(row.due_day),
            entryId: row.entry_id ? String(row.entry_id) : null,
            paidCents: row.entry_id ? toNumber(row.paid_cents) : null,
            paidOn: row.entry_id ? isoDate(row.paid_on) : null,
          })),
          expenseCategories: categories.rows.map((row) => ({
            category: String(row.category),
            cents: toNumber(row.cents),
            fixedCents: toNumber(row.fixed_cents),
          })),
          trend: trend.rows.map((row) => ({
            month: String(row.month),
            incomeCents: toNumber(row.income),
            expenseCents: toNumber(row.expense),
          })),
          topClients: topClients.rows.map((row) => ({
            client: String(row.client),
            cents: toNumber(row.cents),
            visits: toNumber(row.visits),
          })),
          courtesyAppointments: toNumber(courtesy.rows[0]?.total),
          stock: {
            items: toNumber(stock.rows[0]?.items),
            valueCents: Math.round(toNumber(stock.rows[0]?.value)),
            restockCents: Math.round(toNumber(stock.rows[0]?.restock)),
            usedCents: Math.round(toNumber(stockUsed.rows[0]?.used)),
            low: toNumber(stock.rows[0]?.low),
            withoutCost: toNumber(stock.rows[0]?.without_cost),
          },
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
            billId: uuidSchema,
            billMonth: { type: 'string', pattern: monthPattern },
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

  app.post<{
    Params: { clinicId: string }
    Body: {
      recipient: string
      professional: boolean
      month: string
      salaryCents: number
      commissionBps: number
      expectedCents: number
      paidOn: string
      method: string
    }
  }>(
    '/clinics/:clinicId/finance/team-payments',
    {
      schema: {
        params: clinicRefParams,
        body: {
          type: 'object',
          additionalProperties: false,
          required: [
            'recipient',
            'professional',
            'month',
            'salaryCents',
            'commissionBps',
            'expectedCents',
            'paidOn',
            'method',
          ],
          properties: {
            recipient: uuidSchema,
            professional: { type: 'boolean' },
            month: { type: 'string', pattern: monthPattern },
            salaryCents: { type: 'integer', minimum: 0, maximum: 100000000 },
            commissionBps: { type: 'integer', minimum: 0, maximum: 10000 },
            expectedCents: { type: 'integer', minimum: 1, maximum: 100000000 },
            paidOn: dateSchema,
            method: {
              type: 'string',
              enum: ['pix', 'cash', 'credit', 'debit', 'transfer', 'other'],
            },
          },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'finance:manage', async (connection, tenant) => {
        const {
          recipient,
          professional,
          month,
          salaryCents,
          commissionBps,
          expectedCents,
          paidOn,
          method,
        } = request.body
        const { rows } = await connection.query(
          'SELECT luminix.record_team_payment($1,$2,$3,$4::date,$5,$6,$7,$8::date,$9) AS id',
          [
            tenant.clinicId,
            recipient,
            professional,
            month + '-01',
            salaryCents,
            commissionBps,
            expectedCents,
            paidOn,
            method,
          ],
        )
        return { id: String(rows[0]?.id) }
      }),
  )

  // Recurring bill (conta fixa): expected amount and due day. Archiving keeps past entries.
  app.put<{ Params: { clinicId: string; billId: string }; Body: Record<string, unknown> }>(
    '/clinics/:clinicId/finance/bills/:billId',
    {
      schema: {
        params: clinicItemParams('billId'),
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'category', 'amountCents', 'dueDay', 'status'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 80 },
            category: { type: 'string', minLength: 1, maxLength: 60 },
            amountCents: { type: 'integer', minimum: 0, maximum: 100000000 },
            dueDay: { anyOf: [{ type: 'integer', minimum: 1, maximum: 31 }, { type: 'null' }] },
            status: { type: 'string', enum: ['active', 'archived'] },
          },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'finance:manage', async (connection, tenant) => {
        await connection.query('SELECT luminix.save_finance_bill($1::uuid, $2::jsonb)', [
          tenant.clinicId,
          JSON.stringify({ ...request.body, id: request.params.billId }),
        ])
        return { id: request.params.billId }
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
