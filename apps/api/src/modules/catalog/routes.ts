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
import { publicMediaUrl } from '../clinics/media-storage.js'

/**
 * Service catalog (created by onboarding, edited here) and promotions: a percent for every
 * chosen service, or a hand-picked price for each one. Every write
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
        const [services, promotions, links, usage, today, permissions, team] = await Promise.all([
          connection.query(
            `SELECT s.id, s.name, coalesce(s.category, 'Cuidados') AS category, s.description,
                    s.price_cents, s.price_type, s.duration_minutes, s.booking_mode, s.audience,
                    s.is_sensitive, s.is_evaluation, s.status, promo.promotion_id, promo.percent, promo.ends_on,
                    promo.price_cents AS promo_price_cents
               FROM luminix.services s
               LEFT JOIN LATERAL luminix.service_promotion(s.clinic_id, s.id, luminix.clinic_today())
                 promo ON true
              WHERE s.clinic_id = $1
              ORDER BY s.status, s.category, s.name, s.id LIMIT 200`,
            [tenant.clinicId],
          ),
          connection.query(
            `SELECT p.id, p.name, p.kind, p.percent, p.starts_on, p.ends_on, p.status, p.show_on_site,
                    coalesce(array_agg(ps.service_id) FILTER (WHERE ps.service_id IS NOT NULL), '{}') AS service_ids,
                    coalesce(jsonb_object_agg(ps.service_id, ps.price_cents)
                      FILTER (WHERE ps.price_cents IS NOT NULL), '{}'::jsonb) AS prices
               FROM luminix.promotions p
               LEFT JOIN luminix.promotion_services ps ON ps.clinic_id = p.clinic_id AND ps.promotion_id = p.id
              WHERE p.clinic_id = $1 AND p.status <> 'archived'
              GROUP BY p.id ORDER BY p.created_at DESC LIMIT 50`,
            [tenant.clinicId],
          ),
          connection.query(
            `SELECT ps.service_id, count(*) AS professionals,
                    array_agg(ps.professional_id ORDER BY lower(p.display_name)) AS professional_ids
               FROM luminix.professional_services ps
               JOIN luminix.professionals p ON p.clinic_id = ps.clinic_id AND p.id = ps.professional_id
                AND p.status = 'active' AND p.attends
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
          // Who can be chosen in "Quem faz" (Novo serviço).
          connection.query(
            `SELECT p.id, p.display_name, p.gender, photo.small_object_key AS photo_key
               FROM luminix.professionals p
               LEFT JOIN luminix.media_assets photo ON photo.clinic_id = p.clinic_id
                 AND photo.id = p.photo_asset_id AND photo.status = 'ready'
              WHERE p.clinic_id = $1 AND p.status = 'active' AND p.attends
              ORDER BY lower(p.display_name) LIMIT 100`,
            [tenant.clinicId],
          ),
        ])
        const count = (rows: Record<string, unknown>[], id: string, field: string) =>
          Number(rows.find((row) => String(row.service_id) === id)?.[field] ?? 0)
        return {
          today: isoDate(today.rows[0]?.today),
          canManage: permissions.has('service:manage'),
          team: team.rows.map((row) => {
            let photoUrl: string | null = null
            try {
              photoUrl = row.photo_key ? publicMediaUrl(String(row.photo_key)) : null
            } catch {
              photoUrl = null
            }
            return {
              id: String(row.id),
              name: String(row.display_name),
              gender: row.gender === 'male' ? 'male' : 'female',
              photoUrl,
            }
          }),
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
              evaluation: row.is_evaluation === true,
              status: row.status,
              professionals: count(links.rows, id, 'professionals'),
              professionalIds: (
                (links.rows.find((row) => String(row.service_id) === id)?.professional_ids ??
                  []) as unknown[]
              ).map(String),
              bookings90d: count(usage.rows, id, 'bookings'),
              promotion:
                percent == null
                  ? null
                  : {
                      id: String(row.promotion_id),
                      percent,
                      endsOn: isoDate(row.ends_on),
                      priceCents: Number(row.promo_price_cents),
                    },
            }
          }),
          promotions: promotions.rows.map((row) => ({
            id: String(row.id),
            name: String(row.name),
            kind: row.kind === 'custom' ? 'custom' : 'percent',
            percent: Number(row.percent),
            prices: row.prices as Record<string, number>,
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
            // Who does it (replaces the list when sent).
            professionalIds: { type: 'array', maxItems: 100, uniqueItems: true, items: uuidSchema },
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
          const { professionalIds, ...body } = request.body as Record<string, unknown>
          await connection.query('SELECT luminix.save_service($1::uuid, $2::jsonb)', [
            tenant.clinicId,
            JSON.stringify({ ...body, id: request.params.serviceId }),
          ])
          if (Array.isArray(professionalIds))
            await connection.query(
              'SELECT luminix.set_service_professionals($1::uuid, $2::uuid, $3::uuid[])',
              [tenant.clinicId, request.params.serviceId, professionalIds],
            )
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
            kind: { type: 'string', enum: ['percent', 'custom'] },
            percent: { type: 'integer', minimum: 1, maximum: 90 },
            prices: {
              type: 'object',
              maxProperties: 80,
              additionalProperties: { type: 'integer', minimum: 1, maximum: 100000000 },
            },
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

  // What one service uses from the stock (its recipe), with the products to choose from.
  app.get<{ Params: { clinicId: string; serviceId: string } }>(
    '/clinics/:clinicId/catalog/services/:serviceId/supplies',
    { schema: { params: clinicItemParams('serviceId') } },
    async (request, reply) =>
      authorized(request, reply, 'service:manage', async (connection, tenant) => {
        const [supplies, items] = await Promise.all([
          connection.query(
            `SELECT ss.item_id, ss.quantity FROM luminix.service_supplies ss
              WHERE ss.clinic_id = $1 AND ss.service_id = $2`,
            [tenant.clinicId, request.params.serviceId],
          ),
          connection.query(
            `SELECT id, name, unit, package_size, package_label FROM luminix.inventory_items
              WHERE clinic_id = $1 AND status = 'active' ORDER BY lower(name) LIMIT 500`,
            [tenant.clinicId],
          ),
        ])
        return {
          supplies: supplies.rows.map((row) => ({
            itemId: String(row.item_id),
            quantity: Number(row.quantity),
          })),
          items: items.rows.map((row) => ({
            id: String(row.id),
            name: String(row.name),
            unit: String(row.unit),
            packageSize: row.package_size == null ? null : Number(row.package_size),
            packageLabel: row.package_label ? String(row.package_label) : null,
          })),
        }
      }),
  )

  app.put<{
    Params: { clinicId: string; serviceId: string }
    Body: { items: { itemId: string; quantity: number }[] }
  }>(
    '/clinics/:clinicId/catalog/services/:serviceId/supplies',
    {
      schema: {
        params: clinicItemParams('serviceId'),
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['items'],
          properties: {
            items: {
              type: 'array',
              maxItems: 40,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['itemId', 'quantity'],
                properties: {
                  itemId: uuidSchema,
                  quantity: {
                    type: 'number',
                    exclusiveMinimum: 0,
                    maximum: 999999,
                    multipleOf: 0.01,
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'service:manage', async (connection, tenant) => {
        await connection.query(
          'SELECT luminix.save_service_supplies($1::uuid, $2::uuid, $3::jsonb)',
          [
            tenant.clinicId,
            request.params.serviceId,
            JSON.stringify(
              request.body.items.map((item) => ({ ...item, quantity: String(item.quantity) })),
            ),
          ],
        )
        return { saved: request.body.items.length }
      }),
  )
}
