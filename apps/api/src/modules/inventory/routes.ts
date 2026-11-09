import type { FastifyInstance } from 'fastify'
import {
  clinicRefParams,
  createAuthorizedRoute,
  type Authenticate,
} from '../../shared/tenant/authorized-route.js'
import type { TenantPool } from '../../shared/tenant/clinic-transaction.js'
import { clinicItemParams, toNumber } from '../../shared/tenant/route-helpers.js'

const quantity = { type: 'number', minimum: 0, maximum: 99999999, multipleOf: 0.01 }

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
            `SELECT id, name, category, unit, quantity, min_quantity, cost_cents, updated_at
               FROM luminix.inventory_items
              WHERE clinic_id = $1 AND status = 'active'
              ORDER BY (quantity <= min_quantity) DESC, lower(name) LIMIT 500`,
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
          updatedAt: new Date(String(row.updated_at)).toISOString(),
        }))
        return {
          items: list,
          lowStock: list.filter((item) => item.quantity <= item.minQuantity).length,
          stockValueCents: Math.round(
            list.reduce((sum, item) => sum + (item.costCents ?? 0) * item.quantity, 0),
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
            unit: { type: 'string', enum: ['un', 'ml', 'l', 'g', 'kg', 'cx', 'fr', 'par'] },
            minQuantity: quantity,
            initialQuantity: quantity,
            costCents: {
              anyOf: [{ type: 'integer', minimum: 0, maximum: 100000000 }, { type: 'null' }],
            },
          },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'inventory:manage', async (connection, tenant) => {
        const body = request.body as Record<string, unknown>
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
          }),
        ])
        return { id: request.params.itemId }
      }),
  )

  app.post<{
    Params: { clinicId: string; itemId: string }
    Body: { kind: 'in' | 'out' | 'adjust'; quantity: number; note?: string }
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
}
