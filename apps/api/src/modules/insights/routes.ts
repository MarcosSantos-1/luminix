import type { FastifyInstance } from 'fastify'
import {
  clinicRefParams,
  createAuthorizedRoute,
  type Authenticate,
} from '../../shared/tenant/authorized-route.js'
import type { TenantPool } from '../../shared/tenant/clinic-transaction.js'
import {
  dateSchema,
  isoDate,
  rolePermissions,
  toNumber,
} from '../../shared/tenant/route-helpers.js'

const zone = 'America/Sao_Paulo'

/**
 * Read models for Início, Relatórios and Marketing. Each block is included only when the
 * caller's level allows it, so reception sees the day but not the money.
 */
export async function insightsRoutes(
  app: FastifyInstance,
  authenticate: Authenticate,
  pool: TenantPool | undefined,
) {
  const authorized = createAuthorizedRoute(authenticate, pool)

  app.get<{ Params: { clinicId: string } }>(
    '/clinics/:clinicId/dashboard',
    { schema: { params: clinicRefParams } },
    async (request, reply) =>
      authorized(request, reply, 'agenda:read', async (connection, tenant) => {
        const can = await rolePermissions(connection, tenant)
        const today = isoDate(
          (await connection.query('SELECT luminix.clinic_today() AS d')).rows[0]?.d,
        )!
        const [appointments, week] = await Promise.all([
          connection.query(
            `SELECT a.id, a.starts_at, a.ends_at, a.status, a.price_cents, a.promotion_id,
                    c.display_name AS client, c.contact_phone AS phone, s.name AS service,
                    p.display_name AS professional
               FROM luminix.appointments a
               JOIN luminix.clinic_clients c ON c.clinic_id = a.clinic_id AND c.id = a.clinic_client_id
               JOIN luminix.services s ON s.clinic_id = a.clinic_id AND s.id = a.service_id
               LEFT JOIN luminix.professionals p ON p.clinic_id = a.clinic_id AND p.id = a.professional_id
              WHERE a.clinic_id = $1 AND (a.starts_at AT TIME ZONE '${zone}')::date = $2::date
              ORDER BY a.starts_at, a.id`,
            [tenant.clinicId, today],
          ),
          connection.query(
            `SELECT count(*) FILTER (WHERE status IN ('scheduled', 'confirmed')) AS upcoming
               FROM luminix.appointments
              WHERE clinic_id = $1 AND starts_at >= now() AND starts_at < now() + interval '7 days'`,
            [tenant.clinicId],
          ),
        ])
        const result: Record<string, unknown> = {
          today,
          appointments: appointments.rows.map((row) => ({
            id: String(row.id),
            startsAt: new Date(String(row.starts_at)).toISOString(),
            endsAt: new Date(String(row.ends_at)).toISOString(),
            status: row.status,
            client: String(row.client),
            phone: row.phone ? String(row.phone) : null,
            service: String(row.service),
            professional: row.professional ? String(row.professional) : null,
            priceCents: can.has('finance:manage') ? toNumber(row.price_cents) : null,
            promotion: Boolean(row.promotion_id),
          })),
          upcomingWeek: toNumber(week.rows[0]?.upcoming),
          canManageAgenda: can.has('agenda:manage'),
        }
        if (can.has('client:read')) {
          const clients = await connection.query(
            `SELECT count(*) FILTER (WHERE (created_at AT TIME ZONE '${zone}')::date >= date_trunc('month', $2::date)) AS month,
                    count(*) AS total
               FROM luminix.clinic_clients WHERE clinic_id = $1 AND status = 'active'`,
            [tenant.clinicId, today],
          )
          result.clients = {
            newThisMonth: toNumber(clients.rows[0]?.month),
            total: toNumber(clients.rows[0]?.total),
          }
        }
        if (can.has('finance:manage')) {
          const money = await connection.query(
            `SELECT coalesce(sum(amount_cents) FILTER (WHERE kind = 'income'), 0) AS income,
                    coalesce(sum(amount_cents) FILTER (WHERE kind = 'expense'), 0) AS expense
               FROM luminix.finance_entries
              WHERE clinic_id = $1 AND status = 'active' AND occurred_on >= date_trunc('month', $2::date)`,
            [tenant.clinicId, today],
          )
          result.finance = {
            monthIncomeCents: toNumber(money.rows[0]?.income),
            monthExpenseCents: toNumber(money.rows[0]?.expense),
            todayExpectedCents: appointments.rows
              .filter((row) => ['scheduled', 'confirmed', 'completed'].includes(String(row.status)))
              .reduce((sum, row) => sum + toNumber(row.price_cents), 0),
          }
        }
        if (can.has('inventory:manage')) {
          const low = await connection.query(
            `SELECT name, quantity, unit FROM luminix.inventory_items
              WHERE clinic_id = $1 AND status = 'active' AND quantity <= min_quantity
              ORDER BY quantity LIMIT 5`,
            [tenant.clinicId],
          )
          result.lowStock = low.rows.map((row) => ({
            name: String(row.name),
            quantity: toNumber(row.quantity),
            unit: String(row.unit),
          }))
        }
        const promos = await connection.query(
          `SELECT count(*) AS active FROM luminix.promotions
            WHERE clinic_id = $1 AND status = 'active' AND starts_on <= $2::date
              AND (ends_on IS NULL OR ends_on >= $2::date)`,
          [tenant.clinicId, today],
        )
        result.activePromotions = toNumber(promos.rows[0]?.active)
        if (can.has('audit:read')) {
          const activity = await connection.query(
            'SELECT * FROM luminix.list_recent_activity($1::uuid, 8)',
            [tenant.clinicId],
          )
          result.activity = activity.rows.map((row) => ({
            entity: String(row.entity),
            action: String(row.action),
            label: row.label ? String(row.label) : null,
            detail: row.detail ? String(row.detail) : null,
            createdAt: new Date(String(row.created_at)).toISOString(),
          }))
        }
        return result
      }),
  )

  app.get<{ Params: { clinicId: string }; Querystring: { from?: string; to?: string } }>(
    '/clinics/:clinicId/reports',
    {
      schema: {
        params: clinicRefParams,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { from: dateSchema, to: dateSchema },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'finance:manage', async (connection, tenant) => {
        const today = isoDate(
          (await connection.query('SELECT luminix.clinic_today() AS d')).rows[0]?.d,
        )!
        const from = request.query.from ?? `${today.slice(0, 7)}-01`
        const to = request.query.to ?? today
        if (to < from || Date.parse(to) - Date.parse(from) > 366 * 86400000)
          throw Object.assign(new Error('Invalid period'), { statusCode: 400 })
        const range = [tenant.clinicId, from, to]
        const inRange = `(a.starts_at AT TIME ZONE '${zone}')::date BETWEEN $2::date AND $3::date`
        const [status, ledger, services, professionals, clients, daily] = await Promise.all([
          connection.query(
            `SELECT a.status, count(*) AS total, coalesce(sum(a.price_cents), 0) AS cents
               FROM luminix.appointments a WHERE a.clinic_id = $1 AND ${inRange} GROUP BY a.status`,
            range,
          ),
          connection.query(
            `SELECT coalesce(sum(amount_cents) FILTER (WHERE kind = 'income'), 0) AS income,
                    coalesce(sum(amount_cents) FILTER (WHERE kind = 'expense'), 0) AS expense
               FROM luminix.finance_entries
              WHERE clinic_id = $1 AND status = 'active' AND occurred_on BETWEEN $2::date AND $3::date`,
            range,
          ),
          connection.query(
            `SELECT s.name, count(*) AS total, coalesce(sum(a.price_cents), 0) AS cents
               FROM luminix.appointments a JOIN luminix.services s ON s.clinic_id = a.clinic_id AND s.id = a.service_id
              WHERE a.clinic_id = $1 AND ${inRange} AND a.status IN ('scheduled', 'confirmed', 'completed')
              GROUP BY s.name ORDER BY total DESC, cents DESC LIMIT 8`,
            range,
          ),
          connection.query(
            `SELECT coalesce(p.display_name, 'Sem profissional') AS name, count(*) AS total,
                    coalesce(sum(a.price_cents), 0) AS cents
               FROM luminix.appointments a
               LEFT JOIN luminix.professionals p ON p.clinic_id = a.clinic_id AND p.id = a.professional_id
              WHERE a.clinic_id = $1 AND ${inRange} AND a.status IN ('scheduled', 'confirmed', 'completed')
              GROUP BY 1 ORDER BY total DESC LIMIT 8`,
            range,
          ),
          connection.query(
            `SELECT count(*) AS total FROM luminix.clinic_clients
              WHERE clinic_id = $1 AND (created_at AT TIME ZONE '${zone}')::date BETWEEN $2::date AND $3::date`,
            range,
          ),
          connection.query(
            `SELECT d::date AS day,
                    (SELECT count(*) FROM luminix.appointments a WHERE a.clinic_id = $1
                      AND a.status IN ('scheduled', 'confirmed', 'completed')
                      AND (a.starts_at AT TIME ZONE '${zone}')::date = d::date) AS appointments,
                    (SELECT coalesce(sum(amount_cents), 0) FROM luminix.finance_entries e WHERE e.clinic_id = $1
                      AND e.status = 'active' AND e.kind = 'income' AND e.occurred_on = d::date) AS income
               FROM generate_series($2::date, $3::date, interval '1 day') d ORDER BY d`,
            range,
          ),
        ])
        const byStatus = Object.fromEntries(
          status.rows.map((row) => [
            String(row.status),
            { count: toNumber(row.total), cents: toNumber(row.cents) },
          ]),
        ) as Record<string, { count: number; cents: number }>
        const completed = byStatus.completed ?? { count: 0, cents: 0 }
        const attended = completed.count + (byStatus.no_show?.count ?? 0)
        const total = Object.values(byStatus).reduce((sum, item) => sum + item.count, 0)
        const income = toNumber(ledger.rows[0]?.income)
        const expense = toNumber(ledger.rows[0]?.expense)
        return {
          from,
          to,
          appointments: {
            total,
            byStatus,
            averageTicketCents: completed.count ? Math.round(completed.cents / completed.count) : 0,
            noShowRate: attended ? (byStatus.no_show?.count ?? 0) / attended : 0,
            cancelRate: total ? (byStatus.canceled?.count ?? 0) / total : 0,
          },
          finance: { incomeCents: income, expenseCents: expense, balanceCents: income - expense },
          newClients: toNumber(clients.rows[0]?.total),
          topServices: services.rows.map((row) => ({
            name: String(row.name),
            count: toNumber(row.total),
            cents: toNumber(row.cents),
          })),
          professionals: professionals.rows.map((row) => ({
            name: String(row.name),
            count: toNumber(row.total),
            cents: toNumber(row.cents),
          })),
          daily: daily.rows.map((row) => ({
            day: isoDate(row.day),
            appointments: toNumber(row.appointments),
            incomeCents: toNumber(row.income),
          })),
        }
      }),
  )

  app.get<{ Params: { clinicId: string } }>(
    '/clinics/:clinicId/marketing',
    { schema: { params: clinicRefParams } },
    async (request, reply) =>
      authorized(request, reply, 'client:read', async (connection, tenant) => {
        const today = isoDate(
          (await connection.query('SELECT luminix.clinic_today() AS d')).rows[0]?.d,
        )!
        const [birthdays, inactive, site] = await Promise.all([
          connection.query(
            `SELECT id, display_name, contact_phone, birth_date FROM luminix.clinic_clients
              WHERE clinic_id = $1 AND status = 'active' AND birth_date IS NOT NULL
                AND extract(month FROM birth_date) = extract(month FROM $2::date)
              ORDER BY extract(day FROM birth_date), lower(display_name) LIMIT 100`,
            [tenant.clinicId, today],
          ),
          // "Sentimos sua falta": no visit in 60 days (or none since joining 30+ days ago).
          connection.query(
            `SELECT c.id, c.display_name, c.contact_phone, max(a.starts_at) AS last_visit
               FROM luminix.clinic_clients c
               LEFT JOIN luminix.appointments a ON a.clinic_id = c.clinic_id AND a.clinic_client_id = c.id
                AND a.status IN ('completed', 'confirmed', 'scheduled')
              WHERE c.clinic_id = $1 AND c.status = 'active' AND c.created_at < now() - interval '30 days'
              GROUP BY c.id
             HAVING max(a.starts_at) IS NULL OR max(a.starts_at) < now() - interval '60 days'
              ORDER BY max(a.starts_at) NULLS FIRST LIMIT 50`,
            [tenant.clinicId],
          ),
          connection.query(
            `SELECT c.slug, coalesce(p.public_enabled, false) AS published
               FROM luminix.clinics c LEFT JOIN luminix.clinic_profiles p ON p.clinic_id = c.id
              WHERE c.id = $1`,
            [tenant.clinicId],
          ),
        ])
        const client = (row: Record<string, unknown>) => ({
          id: String(row.id),
          name: String(row.display_name),
          phone: row.contact_phone ? String(row.contact_phone) : null,
        })
        return {
          today,
          site: {
            slug: String(site.rows[0]?.slug ?? ''),
            published: site.rows[0]?.published === true,
          },
          birthdays: birthdays.rows.map((row) => ({
            ...client(row),
            day: Number(isoDate(row.birth_date)!.slice(8, 10)),
          })),
          inactive: inactive.rows.map((row) => ({
            ...client(row),
            lastVisit: row.last_visit ? new Date(String(row.last_visit)).toISOString() : null,
          })),
        }
      }),
  )
}
