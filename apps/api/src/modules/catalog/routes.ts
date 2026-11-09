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
  rolePermissions,
  uuidSchema,
} from '../../shared/tenant/route-helpers.js'

const discounted = (price: number, percent: number | null) =>
  percent == null ? null : Math.round((price * (100 - percent)) / 100)

/**
 * Service catalog (created by onboarding, edited here) and percent promotions. Every write
 * changes the public site, so it expires the page cache after commit.
 */
export async function catalogRoutes(
  app: FastifyInstance,
  authenticate: Authenticate,
  pool: TenantPool | undefined,
) {
  const authorized = createAuthorizedRoute(authenticate, pool)

  app.get<{ Params: { clinicId: string } }>(
    '/clinics/:clinicId/catalog',
    { schema: { params: clinicRefParams } },
    async (request, reply) =>
      authorized(request, reply, 'agenda:read', async (connection, tenant) => {
        const [services, promotions, links, usage, today, permissions] = await Promise.all([
          connection.query(
            `SELECT s.id, s.name, coalesce(s.category, 'Cuidados') AS category, s.description,
                    s.price_cents, s.price_type, s.duration_minutes, s.booking_mode, s.audience,
                    s.is_sensitive, s.status, promo.promotion_id, promo.percent, promo.ends_on
               FROM luminix.services s
               LEFT JOIN LATERAL luminix.service_promotion(s.clinic_id, s.id, luminix.clinic_today())
                 promo ON true
              WHERE s.clinic_id = $1
              ORDER BY s.status, s.category, s.name, s.id LIMIT 200`,
            [tenant.clinicId],
          ),
          connection.query(
            `SELECT p.id, p.name, p.percent, p.starts_on, p.ends_on, p.status, p.show_on_site,
                    coalesce(array_agg(ps.service_id) FILTER (WHERE ps.service_id IS NOT NULL), '{}') AS service_ids
               FROM luminix.promotions p
               LEFT JOIN luminix.promotion_services ps ON ps.clinic_id = p.clinic_id AND ps.promotion_id = p.id
              WHERE p.clinic_id = $1 AND p.status <> 'archived'
              GROUP BY p.id ORDER BY p.created_at DESC LIMIT 50`,
            [tenant.clinicId],
          ),
          connection.query(
            `SELECT ps.service_id, count(*) AS professionals
               FROM luminix.professional_services ps
               JOIN luminix.professionals p ON p.clinic_id = ps.clinic_id AND p.id = ps.professional_id
                AND p.status = 'active'
              WHERE ps.clinic_id = $1 GROUP BY ps.service_id`,
            [tenant.clinicId],
          ),
          connection.query(
            `SELECT service_id, count(*) AS bookings FROM luminix.appointments
              WHERE clinic_id = $1 AND starts_at > now() - interval '90 days'
                AND status IN ('scheduled', 'confirmed', 'completed')
              GROUP BY service_id`,
            [tenant.clinicId],
          ),
          connection.query('SELECT luminix.clinic_today() AS today'),
          rolePermissions(connection, tenant),
        ])
        const count = (rows: Record<string, unknown>[], id: string, field: string) =>
          Number(rows.find((row) => String(row.service_id) === id)?.[field] ?? 0)
        return {
          today: isoDate(today.rows[0]?.today),
          canManage: permissions.has('service:manage'),
          services: services.rows.map((row) => {
            const id = String(row.id)
            const percent = row.percent == null ? null : Number(row.percent)
            return {
              id,
              name: String(row.name),
              category: String(row.category),
              description: row.description ? String(row.description) : '',
              priceCents: Number(row.price_cents),
              priceType: row.price_type,
              durationMinutes: Number(row.duration_minutes),
              bookingMode: row.booking_mode,
              audience: row.audience,
              sensitive: row.is_sensitive === true,
              status: row.status,
              professionals: count(links.rows, id, 'professionals'),
              bookings90d: count(usage.rows, id, 'bookings'),
              promotion:
                percent == null
                  ? null
                  : {
                      id: String(row.promotion_id),
                      percent,
                      endsOn: isoDate(row.ends_on),
                      priceCents: discounted(Number(row.price_cents), percent),
                    },
            }
          }),
          promotions: promotions.rows.map((row) => ({
            id: String(row.id),
            name: String(row.name),
            percent: Number(row.percent),
            startsOn: isoDate(row.starts_on),
            endsOn: isoDate(row.ends_on),
            status: row.status,
            showOnSite: row.show_on_site === true,
            serviceIds: (row.service_ids as string[]).map(String),
          })),
        }
      }),
  )

  app.put<{ Params: { clinicId: string; serviceId: string }; Body: Record<string, unknown> }>(
    '/clinics/:clinicId/catalog/services/:serviceId',
    {
      schema: {
        params: clinicItemParams('serviceId'),
        body: {
          type: 'object',
          additionalProperties: false,
          required: [
            'name',
            'category',
            'description',
            'priceCents',
            'priceType',
            'durationMinutes',
            'bookingMode',
            'audience',
            'sensitive',
          ],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 160 },
            category: { type: 'string', minLength: 1, maxLength: 120 },
            description: { type: 'string', maxLength: 1200 },
            priceCents: { type: 'integer', minimum: 0, maximum: 999999999 },
            priceType: { type: 'string', enum: ['fixed', 'from', 'quote'] },
            durationMinutes: { type: 'integer', minimum: 5, maximum: 1440 },
            bookingMode: { type: 'string', enum: ['instant', 'request', 'manual_release'] },
            audience: { type: 'string', enum: ['all', 'women', 'men'] },
            sensitive: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) =>
      authorized(
        request,
        reply,
        'service:manage',
        async (connection, tenant) => {
          await connection.query('SELECT luminix.save_service($1::uuid, $2::jsonb)', [
            tenant.clinicId,
            JSON.stringify({ ...request.body, id: request.params.serviceId }),
          ])
          return { id: request.params.serviceId }
        },
        undefined,
        true,
      ),
  )

  app.post<{ Params: { clinicId: string; serviceId: string }; Body: { status: string } }>(
    '/clinics/:clinicId/catalog/services/:serviceId/status',
    {
      schema: {
        params: clinicItemParams('serviceId'),
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['status'],
          properties: { status: { type: 'string', enum: ['active', 'archived'] } },
        },
      },
    },
    async (request, reply) =>
      authorized(
        request,
        reply,
        'service:manage',
        async (connection, tenant) => {
          await connection.query(
            'SELECT luminix.set_service_status($1::uuid, $2::uuid, $3::text)',
            [tenant.clinicId, request.params.serviceId, request.body.status],
          )
          return { status: request.body.status }
        },
        undefined,
        true,
      ),
  )

  app.put<{ Params: { clinicId: string; promotionId: string }; Body: Record<string, unknown> }>(
    '/clinics/:clinicId/catalog/promotions/:promotionId',
    {
      schema: {
        params: clinicItemParams('promotionId'),
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'percent', 'startsOn', 'endsOn', 'status', 'showOnSite', 'serviceIds'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 80 },
            percent: { type: 'integer', minimum: 1, maximum: 90 },
            startsOn: dateSchema,
            endsOn: { anyOf: [dateSchema, { type: 'null' }] },
            status: { type: 'string', enum: ['active', 'paused', 'archived'] },
            showOnSite: { type: 'boolean' },
            serviceIds: {
              type: 'array',
              minItems: 1,
              maxItems: 80,
              uniqueItems: true,
              items: uuidSchema,
            },
          },
        },
      },
    },
    async (request, reply) =>
      authorized(
        request,
        reply,
        'service:manage',
        async (connection, tenant) => {
          await connection.query('SELECT luminix.save_promotion($1::uuid, $2::jsonb)', [
            tenant.clinicId,
            JSON.stringify({ ...request.body, id: request.params.promotionId }),
          ])
          return { id: request.params.promotionId }
        },
        undefined,
        true,
      ),
  )
}
