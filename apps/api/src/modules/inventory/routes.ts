import type { FastifyInstance } from 'fastify'
import {
  clinicRefParams,
  createAuthorizedRoute,
  type Authenticate,
} from '../../shared/tenant/authorized-route.js'
import type { TenantPool } from '../../shared/tenant/clinic-transaction.js'
import { clinicItemParams, toNumber, uuidSchema } from '../../shared/tenant/route-helpers.js'
import { publicMediaUrl } from '../clinics/media-storage.js'

const quantity = { type: 'number', minimum: 0, maximum: 99999999, multipleOf: 0.01 }
const dateSchema = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }

function setExpiry(
  connection: { query: (sql: string, values: unknown[]) => Promise<unknown> },
  clinicId: string,
  itemId: string,
  tracks: boolean,
  expiresOn: string | null,
) {
  return connection.query(
    'SELECT luminix.set_inventory_expiry($1::uuid, $2::uuid, $3::boolean, $4::date)',
    [clinicId, itemId, tracks, expiresOn],
  )
}

/** Products used in the services or sold at the counter; movements keep the running balance. */
export async function inventoryRoutes(
  app: FastifyInstance,
  authenticate: Authenticate,
  pool: TenantPool | undefined,
) {
  const authorized = createAuthorizedRoute(authenticate, pool)

  app.get<{ Params: { clinicId: string } }>(
    '/clinics/:clinicId/inventory',
    { schema: { params: clinicRefParams } },
    async (request, reply) =>
      authorized(request, reply, 'inventory:manage', async (connection, tenant) => {
        const [items, movements] = await Promise.all([
          connection.query(
            `SELECT i.id, i.name, i.category, i.unit, i.quantity, i.min_quantity, i.cost_cents,
                    i.package_size, i.package_label, i.alert_percent, i.reference_quantity,
                    i.catalog_id, i.updated_at, i.photo_asset_id, i.tracks_expiry,
                    to_char(i.expires_on, 'YYYY-MM-DD') AS expires_on,
                    (i.expires_on - luminix.clinic_today()) AS expires_in,
                    (SELECT coalesce(sum(m.quantity), 0) FROM luminix.inventory_movements m
                      WHERE m.clinic_id = i.clinic_id AND m.item_id = i.id AND m.kind = 'out'
                        AND m.created_at > now() - interval '30 days') AS used_30,
                    (SELECT count(*) FROM luminix.service_supplies ss
                      WHERE ss.clinic_id = i.clinic_id AND ss.item_id = i.id) AS services,
                    photo.small_object_key AS photo_key, photo.large_object_key AS photo_large_key
               FROM luminix.inventory_items i
               LEFT JOIN luminix.media_assets photo ON photo.clinic_id = i.clinic_id
                AND photo.id = i.photo_asset_id AND photo.status = 'ready'
              WHERE i.clinic_id = $1 AND i.status = 'active'
              ORDER BY (i.quantity <= i.min_quantity) DESC, lower(i.name) LIMIT 500`,
            [tenant.clinicId],
          ),
          connection.query(
            `SELECT m.id, m.item_id, i.name, i.unit, m.kind, m.quantity, m.balance, m.note, m.created_at
               FROM luminix.inventory_movements m
               JOIN luminix.inventory_items i ON i.clinic_id = m.clinic_id AND i.id = m.item_id
              WHERE m.clinic_id = $1 ORDER BY m.created_at DESC LIMIT 30`,
            [tenant.clinicId],
          ),
        ])
        const list = items.rows.map((row) => ({
          id: String(row.id),
          name: String(row.name),
          category: row.category ? String(row.category) : '',
          unit: String(row.unit),
          quantity: toNumber(row.quantity),
          minQuantity: toNumber(row.min_quantity),
          costCents: row.cost_cents == null ? null : Number(row.cost_cents),
          packageSize: row.package_size == null ? null : toNumber(row.package_size),
          packageLabel: row.package_label ? String(row.package_label) : null,
          alertPercent: row.alert_percent == null ? null : Number(row.alert_percent),
          referenceQuantity:
            row.reference_quantity == null ? null : toNumber(row.reference_quantity),
          catalogId: row.catalog_id ? String(row.catalog_id) : null,
          // Base units used in the last 30 days (services and manual), for "acaba em ~N dias".
          used30: toNumber(row.used_30),
          services: toNumber(row.services),
          tracksExpiry: Boolean(row.tracks_expiry),
          expiresOn: row.expires_on ? String(row.expires_on) : null,
          // Days from the clinic's today until it expires; negative when already expired.
          expiresIn: row.expires_in == null ? null : Number(row.expires_in),
          photoAssetId: row.photo_key ? String(row.photo_asset_id) : '',
          photoUrl: row.photo_key ? publicMediaUrl(String(row.photo_key)) : null,
          photoLargeUrl: row.photo_large_key ? publicMediaUrl(String(row.photo_large_key)) : null,
          updatedAt: new Date(String(row.updated_at)).toISOString(),
        }))
        return {
          items: list,
          lowStock: list.filter((item) => item.quantity <= item.minQuantity).length,
          // Expired or expiring within 30 days, among products with something on the shelf.
          expiring: list.filter(
            (item) => item.expiresIn != null && item.expiresIn <= 30 && item.quantity > 0,
          ).length,
          stockValueCents: Math.round(
            list.reduce(
              (sum, item) =>
                sum + ((item.costCents ?? 0) * item.quantity) / (item.packageSize ?? 1),
              0,
            ),
          ),
          movements: movements.rows.map((row) => ({
            id: String(row.id),
            itemId: String(row.item_id),
            name: String(row.name),
            unit: String(row.unit),
            kind: row.kind,
            quantity: toNumber(row.quantity),
            balance: toNumber(row.balance),
            note: row.note ? String(row.note) : '',
            createdAt: new Date(String(row.created_at)).toISOString(),
          })),
        }
      }),
  )

  app.put<{ Params: { clinicId: string; itemId: string }; Body: Record<string, unknown> }>(
    '/clinics/:clinicId/inventory/items/:itemId',
    {
      schema: {
        params: clinicItemParams('itemId'),
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'unit', 'minQuantity'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 120 },
            category: { type: 'string', maxLength: 60 },
            unit: {
              type: 'string',
              enum: ['un', 'ml', 'l', 'g', 'kg', 'cx', 'fr', 'par', 'm', 'cm', 'folha'],
            },
            minQuantity: quantity,
            initialQuantity: quantity,
            costCents: {
              anyOf: [{ type: 'integer', minimum: 0, maximum: 100000000 }, { type: 'null' }],
            },
            // What one unit holds ("pote de 400 g"); both or neither.
            packageSize: { anyOf: [{ ...quantity, exclusiveMinimum: 0 }, { type: 'null' }] },
            packageLabel: { type: 'string', maxLength: 30 },
            // Alert at a percent of the level right after restocking (null: at minQuantity).
            alertPercent: {
              anyOf: [{ type: 'integer', minimum: 1, maximum: 90 }, { type: 'null' }],
            },
            catalogId: { type: 'string', pattern: '^[a-z0-9áéíóúâêôãõç-]{1,80}$' },
            // Recipes that use this product, replaced when sent.
            supplies: {
              type: 'array',
              maxItems: 200,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['serviceId', 'quantity'],
                properties: {
                  serviceId: uuidSchema,
                  quantity: {
                    type: 'number',
                    exclusiveMinimum: 0,
                    maximum: 999999,
                    multipleOf: 0.01,
                  },
                },
              },
            },
            photoAssetId: { anyOf: [uuidSchema, { type: 'string', maxLength: 0 }] },
            // Validade: whether the product is tracked and the date of what is on the shelf.
            tracksExpiry: { type: 'boolean' },
            expiresOn: { anyOf: [dateSchema, { type: 'null' }] },
          },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'inventory:manage', async (connection, tenant) => {
        const { tracksExpiry, expiresOn, ...body } = request.body as Record<string, unknown>
        await connection.query('SELECT luminix.save_inventory_item($1::uuid, $2::jsonb)', [
          tenant.clinicId,
          JSON.stringify({
            ...body,
            id: request.params.itemId,
            minQuantity: String(body.minQuantity),
            ...(body.initialQuantity === undefined
              ? {}
              : { initialQuantity: String(body.initialQuantity) }),
            costCents: body.costCents == null ? '' : String(body.costCents),
            packageSize: body.packageSize == null ? '' : String(body.packageSize),
            packageLabel: body.packageLabel ?? '',
            alertPercent: body.alertPercent == null ? '' : String(body.alertPercent),
            ...(body.supplies === undefined
              ? {}
              : {
                  supplies: (body.supplies as { serviceId: string; quantity: number }[]).map(
                    (supply) => ({ ...supply, quantity: String(supply.quantity) }),
                  ),
                }),
            photoAssetId: body.photoAssetId ?? '',
          }),
        ])
        if (tracksExpiry !== undefined)
          await setExpiry(
            connection,
            tenant.clinicId,
            request.params.itemId,
            Boolean(tracksExpiry),
            tracksExpiry ? ((expiresOn as string | null | undefined) ?? null) : null,
          )
        return { id: request.params.itemId }
      }),
  )

  app.post<{
    Params: { clinicId: string; itemId: string }
    Body: {
      kind: 'in' | 'out' | 'adjust'
      quantity: number
      note?: string
      expiresOn?: string
    }
  }>(
    '/clinics/:clinicId/inventory/items/:itemId/movements',
    {
      schema: {
        params: clinicItemParams('itemId'),
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'quantity'],
          properties: {
            kind: { type: 'string', enum: ['in', 'out', 'adjust'] },
            quantity,
            note: { type: 'string', maxLength: 160 },
            // Restocking a product with validade: the date of what arrived.
            expiresOn: dateSchema,
          },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'inventory:manage', async (connection, tenant) => {
        const balance = (
          await connection.query(
            'SELECT luminix.move_inventory($1::uuid, $2::uuid, $3::text, $4::numeric, $5::text) AS balance',
            [
              tenant.clinicId,
              request.params.itemId,
              request.body.kind,
              request.body.quantity,
              request.body.note ?? null,
            ],
          )
        ).rows[0]?.balance
        if (request.body.expiresOn && request.body.kind !== 'out')
          await setExpiry(
            connection,
            tenant.clinicId,
            request.params.itemId,
            true,
            request.body.expiresOn,
          )
        return { balance: toNumber(balance) }
      }),
  )

  app.post<{ Params: { clinicId: string; itemId: string }; Body: Record<string, never> }>(
    '/clinics/:clinicId/inventory/items/:itemId/archive',
    {
      schema: {
        params: clinicItemParams('itemId'),
        body: { type: 'object', additionalProperties: false },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'inventory:manage', async (connection, tenant) => {
        await connection.query('SELECT luminix.archive_inventory_item($1::uuid, $2::uuid)', [
          tenant.clinicId,
          request.params.itemId,
        ])
        return { archived: true }
      }),
  )

  // Renames a category on every product, or removes it (to: "").
  app.post<{ Params: { clinicId: string }; Body: { from: string; to: string } }>(
    '/clinics/:clinicId/inventory/categories',
    {
      schema: {
        params: clinicRefParams,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['from', 'to'],
          properties: {
            from: { type: 'string', minLength: 1, maxLength: 60 },
            to: { type: 'string', maxLength: 60 },
          },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'inventory:manage', async (connection, tenant) => {
        const changed = (
          await connection.query(
            'SELECT luminix.rename_inventory_category($1::uuid, $2::text, $3::text) AS n',
            [tenant.clinicId, request.body.from, request.body.to],
          )
        ).rows[0]?.n
        return { changed: toNumber(changed) }
      }),
  )
}
