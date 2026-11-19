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
import { privateMediaUrl, privateStorageReady } from '../clinics/media-storage.js'

const postBody = {
  type: 'object',
  additionalProperties: false,
  required: ['title'],
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 120, pattern: '\\S' },
    caption: { type: 'string', maxLength: 2200 },
    scheduledOn: { anyOf: [dateSchema, { type: 'null' }] },
    scheduledTime: {
      anyOf: [{ type: 'string', pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$' }, { type: 'null' }],
    },
    channels: {
      type: 'array',
      maxItems: 5,
      uniqueItems: true,
      items: { type: 'string', enum: ['instagram', 'facebook', 'whatsapp', 'tiktok', 'google'] },
    },
    format: { type: 'string', enum: ['post', 'carousel', 'reels', 'stories', 'status'] },
    status: { type: 'string', enum: ['idea', 'planned', 'published'] },
    mediaItemId: { anyOf: [uuidSchema, { type: 'null' }] },
  },
} as const

/**
 * Marketing: calendário de postagens. Reading follows the Marketing page (client:read); writing
 * follows promotions (service:manage), re-checked by the SQL function.
 */
export async function marketingRoutes(
  app: FastifyInstance,
  authenticate: Authenticate,
  pool: TenantPool | undefined,
) {
  const authorized = createAuthorizedRoute(authenticate, pool)

  app.get<{ Params: { clinicId: string }; Querystring: { from?: string; to?: string } }>(
    '/clinics/:clinicId/marketing/posts',
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
      authorized(request, reply, 'client:read', async (connection, tenant) => {
        const [posts, permissions] = await Promise.all([
          connection.query(
            `SELECT p.id, p.title, p.caption, p.scheduled_on, p.scheduled_time, p.channels,
                    p.format, p.status, p.media_item_id, a.small_object_key AS media_key
               FROM luminix.marketing_posts p
               LEFT JOIN luminix.media_items i ON i.clinic_id = p.clinic_id
                 AND i.id = p.media_item_id AND i.status = 'active'
               LEFT JOIN luminix.media_assets a ON a.clinic_id = i.clinic_id AND a.id = i.asset_id
              WHERE p.clinic_id = $1
                AND (p.scheduled_on IS NULL
                  OR (($2::date IS NULL OR p.scheduled_on >= $2::date)
                    AND ($3::date IS NULL OR p.scheduled_on <= $3::date)))
              ORDER BY p.scheduled_on NULLS FIRST, p.scheduled_time NULLS FIRST, p.created_at
              LIMIT 400`,
            [tenant.clinicId, request.query.from ?? null, request.query.to ?? null],
          ),
          rolePermissions(connection, tenant),
        ])
        const ready = privateStorageReady()
        return {
          canManage: permissions.has('service:manage'),
          posts: await Promise.all(
            posts.rows.map(async (row) => ({
              id: String(row.id),
              title: String(row.title),
              caption: String(row.caption ?? ''),
              scheduledOn: row.scheduled_on ? isoDate(row.scheduled_on) : null,
              scheduledTime: row.scheduled_time ? String(row.scheduled_time) : null,
              channels: (row.channels ?? []) as string[],
              format: String(row.format),
              status: String(row.status),
              mediaItemId: row.media_item_id ? String(row.media_item_id) : null,
              mediaUrl:
                ready && row.media_key ? await privateMediaUrl(String(row.media_key)) : null,
            })),
          ),
        }
      }),
  )

  app.put<{ Params: { clinicId: string; postId: string }; Body: Record<string, unknown> }>(
    '/clinics/:clinicId/marketing/posts/:postId',
    { bodyLimit: 16384, schema: { params: clinicItemParams('postId'), body: postBody } },
    async (request, reply) =>
      authorized(request, reply, 'service:manage', async (connection, tenant) => {
        await connection.query(
          'SELECT luminix.save_marketing_post($1::uuid, $2::uuid, $3::jsonb, false)',
          [tenant.clinicId, request.params.postId, JSON.stringify(request.body)],
        )
        return { id: request.params.postId }
      }),
  )

  app.post<{ Params: { clinicId: string; postId: string } }>(
    '/clinics/:clinicId/marketing/posts/:postId/remove',
    { schema: { params: clinicItemParams('postId') } },
    async (request, reply) =>
      authorized(request, reply, 'service:manage', async (connection, tenant) => {
        await connection.query(
          "SELECT luminix.save_marketing_post($1::uuid, $2::uuid, '{}'::jsonb, true)",
          [tenant.clinicId, request.params.postId],
        )
        return { removed: true }
      }),
  )
}
