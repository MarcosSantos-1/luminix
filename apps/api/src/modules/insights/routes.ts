import { appointmentRentalDates } from '../operations/rental-calendar.js'
import type { FastifyInstance } from 'fastify'
import {
  clinicRefParams,
  createAuthorizedRoute,
  type Authenticate,
} from '../../shared/tenant/authorized-route.js'
import type { TenantPool } from '../../shared/tenant/clinic-transaction.js'
import { clientPhotoUrl } from '../clinics/media-storage.js'
import { isPaid } from '../../shared/tenant/route-helpers.js'
import {
  dateSchema,
  isoDate,
  rolePermissions,
  toNumber,
} from '../../shared/tenant/route-helpers.js'

const zone = 'America/Sao_Paulo'

/**
 * Read models for Início, Relatórios and Marketing. Each block is included only when the
 * caller's level allows it, so Equipe sees the day but not the money.
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
        const [appointments, week, upcoming] = await Promise.all([
          connection.query(
            `SELECT a.id, a.starts_at, a.ends_at, a.status, a.price_cents, a.promotion_id,
                    a.booking_source, a.checked_in_at, a.status_note, a.notes, a.override_reasons, a.previous_starts_at, c.id AS client_id,
                    c.display_name AS client, c.contact_phone AS phone, c.notes AS client_notes,
                    (SELECT m.small_object_key FROM luminix.media_assets m
                     WHERE m.clinic_id = c.clinic_id AND m.id = c.photo_asset_id
                       AND m.status = 'ready') AS photo_key,
                    luminix.clinic_client_has_account_photo(c.clinic_id, c.id) AS account_photo,
                    s.name AS service, ${appointmentRentalDates} AS rental_dates, s.price_type, p.display_name AS professional,
                    luminix.appointment_paid_cents(a.clinic_id, a.id) AS paid_cents
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
          // What comes next, so a quiet day still shows the week ahead.
          connection.query(
            `SELECT a.id, a.starts_at, a.ends_at, a.status, a.price_cents, a.promotion_id,
                    a.booking_source, a.checked_in_at, a.status_note, a.notes, a.override_reasons, a.previous_starts_at, c.id AS client_id,
                    c.display_name AS client, c.contact_phone AS phone, c.notes AS client_notes,
                    (SELECT m.small_object_key FROM luminix.media_assets m
                     WHERE m.clinic_id = c.clinic_id AND m.id = c.photo_asset_id
                       AND m.status = 'ready') AS photo_key,
                    luminix.clinic_client_has_account_photo(c.clinic_id, c.id) AS account_photo,
                    s.name AS service, ${appointmentRentalDates} AS rental_dates, s.price_type, p.display_name AS professional,
                    luminix.appointment_paid_cents(a.clinic_id, a.id) AS paid_cents
               FROM luminix.appointments a
               JOIN luminix.clinic_clients c ON c.clinic_id = a.clinic_id AND c.id = a.clinic_client_id
               JOIN luminix.services s ON s.clinic_id = a.clinic_id AND s.id = a.service_id
               LEFT JOIN luminix.professionals p ON p.clinic_id = a.clinic_id AND p.id = a.professional_id
              WHERE a.clinic_id = $1 AND (a.starts_at AT TIME ZONE '${zone}')::date > $2::date
                AND a.status IN ('scheduled', 'confirmed')
              ORDER BY a.starts_at, a.id LIMIT 6`,
            [tenant.clinicId, today],
          ),
        ])
        const seesClients = can.has('client:read')
        const view = async (row: Record<string, unknown>) => ({
          id: String(row.id),
          startsAt: new Date(String(row.starts_at)).toISOString(),
          endsAt: new Date(String(row.ends_at)).toISOString(),
          previousStartsAt: row.previous_starts_at
            ? new Date(String(row.previous_starts_at)).toISOString()
            : null,
          status: String(row.status),
          clientId: String(row.client_id),
          client: String(row.client),
          phone: row.phone ? String(row.phone) : null,
          clientNotes: seesClients && row.client_notes ? String(row.client_notes) : null,
          photoUrl: seesClients ? await clientPhotoUrl(row.photo_key) : null,
          photoLargeUrl: seesClients
            ? await clientPhotoUrl(
                row.photo_key
                  ? String(row.photo_key).replace(/small-128\.webp$/, 'large-512.webp')
                  : null,
              )
            : null,
          accountPhoto: seesClients && !row.photo_key && row.account_photo === true,
          priceType: String(row.price_type),
          notes: row.notes ? String(row.notes) : null,
          warnings: (row.override_reasons ?? []) as string[],
          service: String(row.service),
          rentalDates: row.rental_dates,
          professional: row.professional ? String(row.professional) : null,
          priceCents: can.has('finance:manage') ? toNumber(row.price_cents) : null,
          paid: isPaid(row),
          paidCents: can.has('finance:manage') ? toNumber(row.paid_cents) : null,
          bookingSource: String(row.booking_source),
          statusNote: row.status_note ? String(row.status_note) : null,
          checkedInAt: row.checked_in_at ? new Date(String(row.checked_in_at)).toISOString() : null,
          promotion: Boolean(row.promotion_id),
        })
        const missingRentals = can.has('service:manage')
          ? (
              await connection.query(
                `SELECT s.name, EXISTS (SELECT FROM luminix.service_resources sr JOIN luminix.resources r
             ON r.clinic_id=sr.clinic_id AND r.id=sr.resource_id WHERE sr.clinic_id=s.clinic_id
             AND sr.service_id=s.id AND r.type='equipment' AND r.availability_mode='manual_release'
             AND r.status='active') AS linked FROM luminix.services s
            WHERE s.clinic_id=$1 AND s.status='active'
            AND cardinality(luminix.service_rental_days(s.clinic_id,s.id,$2::date,'infinity'))=0 ORDER BY s.name`,
                [tenant.clinicId, today],
              )
            ).rows
          : []
        const result: Record<string, unknown> = {
          today,
          missingRentals: missingRentals.map((row) => row.name),
          unlinkedRentalServices: missingRentals
            .filter((row) => !row.linked)
            .map((row) => row.name),
          appointments: await Promise.all(appointments.rows.map(view)),
          upcoming: await Promise.all(upcoming.rows.map(view)),
          upcomingWeek: toNumber(week.rows[0]?.upcoming),
          canManageAgenda: can.has('agenda:manage'),
          canCharge: can.has('finance:manage'),
          canOpenClients: can.has('client:manage'),
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
          const expiring = await connection.query(
            `SELECT name, expires_on - $2::date AS days FROM luminix.inventory_items
              WHERE clinic_id = $1 AND status = 'active' AND tracks_expiry AND quantity > 0
                AND expires_on <= $2::date + 30
              ORDER BY expires_on LIMIT 5`,
            [tenant.clinicId, today],
          )
          result.expiringStock = expiring.rows.map((row) => ({
            name: String(row.name),
            days: Number(row.days),
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
        // The same number of days right before, for "vs. período anterior".
        const span = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1
        const shift = (iso: string, days: number) =>
          new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10)
        const previous = [tenant.clinicId, shift(from, -span), shift(from, -1)]
        const inRange = `(a.starts_at AT TIME ZONE '${zone}')::date BETWEEN $2::date AND $3::date`
        const booked = `a.status IN ('scheduled', 'confirmed', 'completed')`
        const [
          status,
          ledger,
          services,
          professionals,
          clients,
          daily,
          before,
          rhythm,
          expenses,
          methods,
          served,
        ] = await Promise.all([
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
          connection.query(
            `SELECT
               (SELECT count(*) FROM luminix.appointments a
                 WHERE a.clinic_id = $1 AND ${inRange} AND ${booked}) AS appointments,
               (SELECT coalesce(sum(a.price_cents), 0) FROM luminix.appointments a
                 WHERE a.clinic_id = $1 AND ${inRange} AND a.status = 'completed') AS completed_cents,
               (SELECT count(*) FROM luminix.appointments a
                 WHERE a.clinic_id = $1 AND ${inRange} AND a.status = 'completed') AS completed,
               (SELECT coalesce(sum(amount_cents) FILTER (WHERE kind = 'income'), 0)
                  FROM luminix.finance_entries WHERE clinic_id = $1 AND status = 'active'
                   AND occurred_on BETWEEN $2::date AND $3::date) AS income,
               (SELECT coalesce(sum(amount_cents) FILTER (WHERE kind = 'expense'), 0)
                  FROM luminix.finance_entries WHERE clinic_id = $1 AND status = 'active'
                   AND occurred_on BETWEEN $2::date AND $3::date) AS expense,
               (SELECT count(*) FROM luminix.clinic_clients WHERE clinic_id = $1
                 AND (created_at AT TIME ZONE '${zone}')::date BETWEEN $2::date AND $3::date) AS clients`,
            previous,
          ),
          // Busiest weekdays and hours (local time).
          connection.query(
            `SELECT extract(isodow FROM a.starts_at AT TIME ZONE '${zone}')::int AS weekday,
                    extract(hour FROM a.starts_at AT TIME ZONE '${zone}')::int AS hour,
                    count(*) AS total
               FROM luminix.appointments a
              WHERE a.clinic_id = $1 AND ${inRange} AND ${booked}
              GROUP BY 1, 2`,
            range,
          ),
          connection.query(
            `SELECT coalesce(nullif(btrim(category), ''), 'Sem categoria') AS name,
                    sum(amount_cents) AS cents, count(*) AS total
               FROM luminix.finance_entries
              WHERE clinic_id = $1 AND status = 'active' AND kind = 'expense'
                AND occurred_on BETWEEN $2::date AND $3::date
              GROUP BY 1 ORDER BY cents DESC LIMIT 8`,
            range,
          ),
          connection.query(
            `SELECT coalesce(nullif(method, ''), 'other') AS method, sum(amount_cents) AS cents,
                    count(*) AS total
               FROM luminix.finance_entries
              WHERE clinic_id = $1 AND status = 'active' AND kind = 'income'
                AND occurred_on BETWEEN $2::date AND $3::date
              GROUP BY 1 ORDER BY cents DESC`,
            range,
          ),
          // Clients seen in the period: first time here vs. coming back.
          connection.query(
            `WITH seen AS (
               SELECT DISTINCT a.clinic_client_id AS id FROM luminix.appointments a
                WHERE a.clinic_id = $1 AND ${inRange} AND a.status = 'completed'
                  AND a.clinic_client_id IS NOT NULL)
             SELECT count(*) AS total,
                    count(*) FILTER (WHERE EXISTS (
                      SELECT 1 FROM luminix.appointments p
                       WHERE p.clinic_id = $1 AND p.clinic_client_id = seen.id
                         AND p.status = 'completed'
                         AND (p.starts_at AT TIME ZONE '${zone}')::date < $2::date)) AS returning
               FROM seen`,
            range,
          ),
        ])
        const weekdays = Array.from({ length: 7 }, () => 0)
        const hours = new Map<number, number>()
        for (const row of rhythm.rows) {
          const count = toNumber(row.total)
          weekdays[(Number(row.weekday) - 1 + 7) % 7] += count
          hours.set(Number(row.hour), (hours.get(Number(row.hour)) ?? 0) + count)
        }
        const prior = before.rows[0] ?? {}
        const priorCompleted = toNumber(prior.completed)
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
          previous: {
            from: previous[1],
            to: previous[2],
            appointments: toNumber(prior.appointments),
            averageTicketCents: priorCompleted
              ? Math.round(toNumber(prior.completed_cents) / priorCompleted)
              : 0,
            incomeCents: toNumber(prior.income),
            expenseCents: toNumber(prior.expense),
            newClients: toNumber(prior.clients),
          },
          // Monday first.
          weekdays,
          hours: [...hours.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([hour, count]) => ({ hour, count })),
          expenseCategories: expenses.rows.map((row) => ({
            name: String(row.name),
            cents: toNumber(row.cents),
            count: toNumber(row.total),
          })),
          incomeMethods: methods.rows.map((row) => ({
            method: String(row.method),
            cents: toNumber(row.cents),
            count: toNumber(row.total),
          })),
          clientsServed: {
            total: toNumber(served.rows[0]?.total),
            returning: toNumber(served.rows[0]?.returning),
          },
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
