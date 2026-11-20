import type { FastifyInstance } from 'fastify'
import type { SqlConnection } from '../../shared/database/migrations.js'
import {
  clinicRefParams,
  createAuthorizedRoute,
  type Authenticate,
} from '../../shared/tenant/authorized-route.js'
import type { TenantPool } from '../../shared/tenant/clinic-transaction.js'
import {
  clinicItemParams,
  dateSchema,
  rolePermissions,
  uuidSchema,
} from '../../shared/tenant/route-helpers.js'
import type { TenantContext } from '../../shared/tenant/tenant-context.js'

const methodSchema = {
  type: 'string',
  enum: ['pix', 'cash', 'credit', 'debit', 'transfer', 'other'],
} as const

function days(from: string, to: string) {
  return (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000
}

/** A finance entry inside the same transaction (needs finance:manage, checked by the function). */
async function financeEntry(
  connection: SqlConnection,
  tenant: TenantContext,
  entry: {
    kind: 'income' | 'expense'
    amountCents: number
    occurredOn: string
    description: string
    category: string
    method?: string
  },
) {
  const result = await connection.query('SELECT luminix.save_finance_entry($1, $2::jsonb) AS id', [
    tenant.clinicId,
    JSON.stringify(entry),
  ])
  return String(result.rows[0].id)
}

/**
 * Pacotes (catálogo, venda à cliente e saldo de sessões) e aparelhos alugados (datas e custo).
 * ADR-032. Every write goes through a SECURITY DEFINER function that re-checks the permission.
 */
export async function packageRoutes(
  app: FastifyInstance,
  authenticate: Authenticate,
  pool: TenantPool | undefined,
) {
  const authorized = createAuthorizedRoute(authenticate, pool)

  // ---------- Catálogo de pacotes e aparelhos (aba Serviços) ----------
  app.get<{ Params: { clinicId: string } }>(
    '/clinics/:clinicId/catalog/extras',
    { schema: { params: clinicRefParams } },
    async (request, reply) =>
      authorized(request, reply, 'agenda:read', async (connection, tenant) => {
        const [packages, sold, equipment, links, rentals, permissions, items] = await Promise.all([
          connection.query(
            `SELECT id, service_id, name, sessions, price_cents, validity_days, status, kind,
                    duration_minutes
               FROM luminix.service_packages WHERE clinic_id = $1
              ORDER BY status, lower(name), id LIMIT 200`,
            [tenant.clinicId],
          ),
          connection.query(
            `SELECT package_id, count(*)::int AS sold,
                    count(*) FILTER (WHERE status = 'active')::int AS active
               FROM luminix.client_packages WHERE clinic_id = $1 AND package_id IS NOT NULL
              GROUP BY package_id`,
            [tenant.clinicId],
          ),
          connection.query(
            `SELECT id, name, supplier, default_cost_cents, status FROM luminix.resources
              WHERE clinic_id = $1 AND type = 'equipment'
              ORDER BY status, lower(name), id LIMIT 100`,
            [tenant.clinicId],
          ),
          connection.query(
            'SELECT resource_id, service_id FROM luminix.service_resources WHERE clinic_id = $1',
            [tenant.clinicId],
          ),
          connection.query(
            `SELECT id, resource_id, starts_on::text AS starts_on, ends_on::text AS ends_on,
                    cost_cents, note, finance_entry_id IS NOT NULL AS in_finance
               FROM luminix.resource_rentals
              WHERE clinic_id = $1 AND ends_on >= luminix.clinic_today() - 60
              ORDER BY starts_on, id LIMIT 300`,
            [tenant.clinicId],
          ),
          rolePermissions(connection, tenant),
          connection.query(
            `SELECT package_id, service_id, sessions FROM luminix.service_package_items
              WHERE clinic_id = $1 ORDER BY package_id, position, service_id`,
            [tenant.clinicId],
          ),
        ])
        const seesMoney = permissions.has('finance:manage')
        return {
          canManage: permissions.has('service:manage'),
          canFinance: seesMoney,
          packages: packages.rows.map((row) => {
            const counts = sold.rows.find((item) => String(item.package_id) === String(row.id))
            return {
              id: String(row.id),
              serviceId: String(row.service_id),
              name: String(row.name),
              kind: row.kind === 'combo' ? 'combo' : 'sessions',
              sessions: Number(row.sessions),
              durationMinutes: row.duration_minutes == null ? null : Number(row.duration_minutes),
              items: items.rows
                .filter((item) => String(item.package_id) === String(row.id))
                .map((item) => ({
                  serviceId: String(item.service_id),
                  sessions: Number(item.sessions),
                })),
              priceCents: Number(row.price_cents),
              validityDays: row.validity_days == null ? null : Number(row.validity_days),
              status: row.status,
              sold: Number(counts?.sold ?? 0),
              activeSold: Number(counts?.active ?? 0),
            }
          }),
          equipment: equipment.rows.map((row) => ({
            id: String(row.id),
            name: String(row.name),
            supplier: row.supplier ? String(row.supplier) : '',
            defaultCostCents:
              seesMoney && row.default_cost_cents != null ? Number(row.default_cost_cents) : null,
            status: row.status,
            serviceIds: links.rows
              .filter((link) => String(link.resource_id) === String(row.id))
              .map((link) => String(link.service_id)),
            rentals: rentals.rows
              .filter((rental) => String(rental.resource_id) === String(row.id))
              .map((rental) => ({
                id: String(rental.id),
                startsOn: String(rental.starts_on),
                endsOn: String(rental.ends_on),
                costCents:
                  seesMoney && rental.cost_cents != null ? Number(rental.cost_cents) : null,
                note: rental.note ? String(rental.note) : '',
                inFinance: rental.in_finance === true,
              })),
          })),
        }
      }),
  )

  app.put<{
    Params: { clinicId: string; packageId: string }
    Body: {
      serviceId?: string
      sessions?: number
      kind?: 'sessions' | 'combo'
      items?: { serviceId: string; sessions: number }[]
      durationMinutes?: number
      name: string
      priceCents: number
      validityDays: number | null
    }
  }>(
    '/clinics/:clinicId/catalog/packages/:packageId',
    {
      bodyLimit: 4096,
      schema: {
        params: clinicItemParams('packageId'),
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'priceCents', 'validityDays'],
          // A combo (several services) or N sessions of one; the old {serviceId, sessions} too.
          anyOf: [{ required: ['items'] }, { required: ['serviceId', 'sessions'] }],
          properties: {
            serviceId: uuidSchema,
            name: { type: 'string', minLength: 1, maxLength: 120, pattern: '\\S' },
            // N sessions of one service, or (combo) visits doing every service of the combo.
            sessions: { type: 'integer', minimum: 1, maximum: 100 },
            kind: { type: 'string', enum: ['sessions', 'combo'] },
            durationMinutes: { type: 'integer', minimum: 5, maximum: 1440 },
            items: {
              type: 'array',
              minItems: 1,
              maxItems: 20,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['serviceId', 'sessions'],
                properties: {
                  serviceId: uuidSchema,
                  sessions: { type: 'integer', minimum: 1, maximum: 100 },
                },
              },
            },
            priceCents: { type: 'integer', minimum: 1, maximum: 100000000 },
            validityDays: {
              anyOf: [{ type: 'integer', minimum: 7, maximum: 1095 }, { type: 'null' }],
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
          await connection.query('SELECT luminix.save_service_package($1, $2::jsonb)', [
            tenant.clinicId,
            JSON.stringify({ ...request.body, id: request.params.packageId }),
          ])
          return { id: request.params.packageId }
        },
        undefined,
        true,
      ),
  )

  app.post<{ Params: { clinicId: string; packageId: string }; Body: { status: string } }>(
    '/clinics/:clinicId/catalog/packages/:packageId/status',
    {
      schema: {
        params: clinicItemParams('packageId'),
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
          await connection.query('SELECT luminix.set_service_package_status($1, $2, $3)', [
            tenant.clinicId,
            request.params.packageId,
            request.body.status,
          ])
          return { status: request.body.status }
        },
        undefined,
        true,
      ),
  )

  // ---------- Pacotes da cliente ----------
  app.get<{ Params: { clinicId: string; clientId: string } }>(
    '/clinics/:clinicId/clients/:clientId/packages',
    { schema: { params: clinicItemParams('clientId') } },
    async (request, reply) =>
      authorized(request, reply, 'agenda:read', async (connection, tenant) => {
        const permissions = await rolePermissions(connection, tenant)
        const result = await connection.query(
          `SELECT cp.id, cp.service_id, cp.name, cp.sessions_total, cp.price_cents, cp.kind,
                  cp.duration_minutes,
                  (SELECT coalesce(jsonb_agg(jsonb_build_object(
                      'serviceId', i.service_id, 'sessions', i.sessions,
                      'used', luminix.client_package_used_for(cp.clinic_id, cp.id, i.service_id))
                    ORDER BY i.position, i.service_id), '[]'::jsonb)
                     FROM luminix.client_package_items i
                    WHERE i.clinic_id = cp.clinic_id AND i.client_package_id = cp.id) AS items,
                  cp.sold_on::text AS sold_on, cp.expires_on::text AS expires_on, cp.status,
                  luminix.client_package_used(cp.clinic_id, cp.id) AS used,
                  (SELECT count(*)::int FROM luminix.appointments a
                    WHERE a.clinic_id = cp.clinic_id AND a.client_package_id = cp.id
                      AND a.status IN ('completed', 'no_show')) AS done,
                  luminix.clinic_today()::text AS today
             FROM luminix.client_packages cp
            WHERE cp.clinic_id = $1 AND cp.clinic_client_id = $2
            ORDER BY cp.status, cp.sold_on DESC, cp.id LIMIT 50`,
          [tenant.clinicId, request.params.clientId],
        )
        return {
          packages: result.rows.map((row) => {
            const used = Number(row.used)
            const total = Number(row.sessions_total)
            const expired = Boolean(row.expires_on && String(row.expires_on) < String(row.today))
            return {
              id: String(row.id),
              serviceId: String(row.service_id),
              name: String(row.name),
              kind: row.kind === 'combo' ? 'combo' : 'sessions',
              durationMinutes: row.duration_minutes == null ? null : Number(row.duration_minutes),
              sessionsTotal: total,
              used,
              done: Number(row.done),
              left: Math.max(0, total - used),
              // Per service (a combo is consumed service by service).
              items: (
                (row.items ?? []) as { serviceId: string; sessions: number; used: number }[]
              ).map((item) => ({
                serviceId: String(item.serviceId),
                sessions: Number(item.sessions),
                used: Number(item.used),
                left: Math.max(0, Number(item.sessions) - Number(item.used)),
              })),
              priceCents: permissions.has('finance:manage') ? Number(row.price_cents) : null,
              soldOn: String(row.sold_on),
              expiresOn: row.expires_on ? String(row.expires_on) : null,
              status:
                row.status === 'canceled'
                  ? 'canceled'
                  : expired
                    ? 'expired'
                    : used >= total
                      ? 'finished'
                      : 'active',
            }
          }),
        }
      }),
  )

  app.post<{
    Params: { clinicId: string; clientId: string }
    Body: { packageId: string; soldOn: string; registerIncome?: boolean; method?: string }
  }>(
    '/clinics/:clinicId/clients/:clientId/packages',
    {
      bodyLimit: 2048,
      schema: {
        params: clinicItemParams('clientId'),
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['packageId', 'soldOn'],
          properties: {
            packageId: uuidSchema,
            soldOn: dateSchema,
            registerIncome: { type: 'boolean' },
            method: methodSchema,
          },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'client:manage', async (connection, tenant) => {
        const catalog = (
          await connection.query(
            `SELECT p.name, p.price_cents, c.display_name FROM luminix.service_packages p
               JOIN luminix.clinic_clients c ON c.clinic_id = p.clinic_id AND c.id = $3
              WHERE p.clinic_id = $1 AND p.id = $2 AND p.status = 'active'`,
            [tenant.clinicId, request.body.packageId, request.params.clientId],
          )
        ).rows[0]
        if (!catalog) return reply.code(400).send({ error: 'Invalid package' })
        const entry = request.body.registerIncome
          ? await financeEntry(connection, tenant, {
              kind: 'income',
              amountCents: Number(catalog.price_cents),
              occurredOn: request.body.soldOn,
              description: `Pacote ${String(catalog.name)} · ${String(catalog.display_name)}`.slice(
                0,
                160,
              ),
              category: 'Pacotes',
              method: request.body.method,
            })
          : null
        const sold = await connection.query(
          'SELECT luminix.sell_client_package($1, $2, $3, $4::date, $5) AS id',
          [
            tenant.clinicId,
            request.params.clientId,
            request.body.packageId,
            request.body.soldOn,
            entry,
          ],
        )
        return reply.code(201).send({ id: String(sold.rows[0].id), financeEntry: entry })
      }),
  )

  app.post<{ Params: { clinicId: string; clientPackageId: string } }>(
    '/clinics/:clinicId/client-packages/:clientPackageId/cancel',
    { schema: { params: clinicItemParams('clientPackageId') } },
    async (request, reply) =>
      authorized(request, reply, 'client:manage', async (connection, tenant) => {
        await connection.query('SELECT luminix.cancel_client_package($1, $2)', [
          tenant.clinicId,
          request.params.clientPackageId,
        ])
        return { status: 'canceled' }
      }),
  )

  // ---------- Aparelhos alugados ----------
  const equipmentBody = {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'serviceIds'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 160, pattern: '\\S' },
      supplier: { type: 'string', maxLength: 120 },
      defaultCostCents: {
        anyOf: [{ type: 'integer', minimum: 1, maximum: 100000000 }, { type: 'null' }],
      },
      serviceIds: { type: 'array', maxItems: 60, uniqueItems: true, items: uuidSchema },
    },
  } as const
  type EquipmentBody = {
    name: string
    supplier?: string
    defaultCostCents?: number | null
    serviceIds: string[]
  }

  app.post<{ Params: { clinicId: string }; Body: EquipmentBody }>(
    '/clinics/:clinicId/catalog/equipment',
    { bodyLimit: 8192, schema: { params: clinicRefParams, body: equipmentBody } },
    async (request, reply) =>
      authorized(request, reply, 'service:manage', async (connection, tenant) => {
        const saved = await connection.query(
          'SELECT luminix.save_rented_equipment($1, $2::jsonb) AS id',
          [tenant.clinicId, JSON.stringify(request.body)],
        )
        return reply.code(201).send({ id: String(saved.rows[0].id) })
      }),
  )

  app.put<{ Params: { clinicId: string; equipmentId: string }; Body: EquipmentBody }>(
    '/clinics/:clinicId/catalog/equipment/:equipmentId',
    {
      bodyLimit: 8192,
      schema: { params: clinicItemParams('equipmentId'), body: equipmentBody },
    },
    async (request, reply) =>
      authorized(request, reply, 'service:manage', async (connection, tenant) => {
        await connection.query('SELECT luminix.save_rented_equipment($1, $2::jsonb)', [
          tenant.clinicId,
          JSON.stringify({ ...request.body, id: request.params.equipmentId }),
        ])
        return { id: request.params.equipmentId }
      }),
  )

  app.post<{ Params: { clinicId: string; equipmentId: string } }>(
    '/clinics/:clinicId/catalog/equipment/:equipmentId/archive',
    { schema: { params: clinicItemParams('equipmentId') } },
    async (request, reply) =>
      authorized(request, reply, 'service:manage', async (connection, tenant) => {
        await connection.query('SELECT luminix.archive_rented_equipment($1, $2)', [
          tenant.clinicId,
          request.params.equipmentId,
        ])
        return { status: 'archived' }
      }),
  )

  // Excluir: the equipment, its links to services and its rental days. Expenses of rentals that
  // already started stay in the Financeiro; those of rentals still ahead are voided, as when a
  // single rental is removed, when the person may change the Financeiro.
  app.post<{ Params: { clinicId: string; equipmentId: string } }>(
    '/clinics/:clinicId/catalog/equipment/:equipmentId/remove',
    { schema: { params: clinicItemParams('equipmentId') } },
    async (request, reply) =>
      authorized(request, reply, 'service:manage', async (connection, tenant) => {
        const removed = await connection.query(
          'SELECT luminix.delete_rented_equipment($1, $2) AS entries',
          [tenant.clinicId, request.params.equipmentId],
        )
        const entries = (removed.rows[0]?.entries ?? []) as string[]
        const canVoid =
          entries.length > 0 && (await rolePermissions(connection, tenant)).has('finance:manage')
        if (canVoid)
          for (const entry of entries)
            await connection.query('SELECT luminix.void_finance_entry($1, $2)', [
              tenant.clinicId,
              entry,
            ])
        return { deleted: true, financeEntriesVoided: canVoid ? entries.length : 0 }
      }),
  )

  app.post<{
    Params: { clinicId: string; equipmentId: string }
    Body: {
      startsOn: string
      endsOn: string
      costCents?: number | null
      note?: string
      registerExpense?: boolean
      method?: string
    }
  }>(
    '/clinics/:clinicId/catalog/equipment/:equipmentId/rentals',
    {
      bodyLimit: 2048,
      schema: {
        params: clinicItemParams('equipmentId'),
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['startsOn', 'endsOn'],
          properties: {
            startsOn: dateSchema,
            endsOn: dateSchema,
            costCents: {
              anyOf: [{ type: 'integer', minimum: 1, maximum: 100000000 }, { type: 'null' }],
            },
            note: { type: 'string', maxLength: 240 },
            registerExpense: { type: 'boolean' },
            method: methodSchema,
          },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'service:manage', async (connection, tenant) => {
        const body = request.body
        const span = days(body.startsOn, body.endsOn)
        if (!(span >= 0 && span <= 62)) return reply.code(400).send({ error: 'Invalid period' })
        if (body.registerExpense && !body.costCents)
          return reply.code(400).send({ error: 'Cost required' })
        const name = (
          await connection.query(
            `SELECT name FROM luminix.resources
              WHERE clinic_id = $1 AND id = $2 AND type = 'equipment'`,
            [tenant.clinicId, request.params.equipmentId],
          )
        ).rows[0]?.name
        if (!name) return reply.code(404).send({ error: 'Equipment not found' })
        const entry =
          body.registerExpense && body.costCents
            ? await financeEntry(connection, tenant, {
                kind: 'expense',
                amountCents: body.costCents,
                occurredOn: body.startsOn,
                description: `Aluguel ${String(name)}`.slice(0, 160),
                category: 'Aluguel de aparelhos',
                method: body.method,
              })
            : null
        const saved = await connection.query(
          'SELECT luminix.save_resource_rental($1, $2, $3::date, $4::date, $5, $6, $7) AS id',
          [
            tenant.clinicId,
            request.params.equipmentId,
            body.startsOn,
            body.endsOn,
            body.costCents ?? null,
            body.note?.trim() || null,
            entry,
          ],
        )
        return reply.code(201).send({ id: String(saved.rows[0].id), financeEntry: entry })
      }),
  )

  app.post<{ Params: { clinicId: string; rentalId: string } }>(
    '/clinics/:clinicId/catalog/rentals/:rentalId/remove',
    { schema: { params: clinicItemParams('rentalId') } },
    async (request, reply) =>
      authorized(request, reply, 'service:manage', async (connection, tenant) => {
        const removed = await connection.query(
          'SELECT luminix.remove_resource_rental($1, $2) AS entry',
          [tenant.clinicId, request.params.rentalId],
        )
        const entry = removed.rows[0]?.entry
        // The expense goes with the rental when the person may change the Financeiro.
        if (entry && (await rolePermissions(connection, tenant)).has('finance:manage'))
          await connection.query('SELECT luminix.void_finance_entry($1, $2)', [
            tenant.clinicId,
            entry,
          ])
        return { removed: true, financeEntryVoided: Boolean(entry) }
      }),
  )
}
