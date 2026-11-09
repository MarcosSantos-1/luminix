import type { FastifyInstance } from 'fastify'
import {
  clinicRefParams,
  createAuthorizedRoute,
  type Authenticate,
} from '../../shared/tenant/authorized-route.js'
import type { TenantPool } from '../../shared/tenant/clinic-transaction.js'
import { privateMediaUrl, privateStorageReady } from '../clinics/media-storage.js'

const uuidPattern = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
const uuid = { type: 'string', pattern: uuidPattern }
const withId = (name: string) => ({
  type: 'object',
  additionalProperties: false,
  required: ['clinicId', name],
  properties: { ...clinicRefParams.properties, [name]: uuid },
})

/**
 * Media library ("Mídia"): private photos in folders. Files are uploaded with the shared media
 * endpoints (kind `library_photo`) and registered here. Reads return signed URLs that expire.
 */
export async function mediaRoutes(
  app: FastifyInstance,
  authenticate: Authenticate,
  pool: TenantPool | undefined,
) {
  const authorized = createAuthorizedRoute(authenticate, pool)

  app.get<{ Params: { clinicId: string } }>(
    '/clinics/:clinicId/library',
    { schema: { params: clinicRefParams } },
    async (request, reply) =>
      authorized(request, reply, 'media:read', async (connection, tenant) => {
        const { rows } = await connection.query(
          'SELECT luminix.read_media_library($1::uuid) AS library',
          [tenant.clinicId],
        )
        const permissions = await connection.query(
          `SELECT permission_code FROM luminix.role_permissions
            WHERE clinic_id = $1 AND role_id = $2 AND permission_code = 'media:manage'`,
          [tenant.clinicId, tenant.role],
        )
        return {
          ...(rows[0]?.library as object),
          storageReady: privateStorageReady(),
          canManage: permissions.rows.length > 0,
        }
      }),
  )

  app.get<{ Params: { clinicId: string }; Querystring: { folder?: string; trash?: string } }>(
    '/clinics/:clinicId/library/items',
    {
      schema: {
        params: clinicRefParams,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { folder: uuid, trash: { type: 'string', enum: ['1'] } },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'media:read', async (connection, tenant) => {
        const trash = request.query.trash === '1'
        if (!trash && !request.query.folder)
          throw Object.assign(new Error('Folder required'), { statusCode: 400 })
        const { rows } = await connection.query(
          `SELECT i.id, i.folder_id, i.title, i.created_at, i.trashed_at,
                  a.small_object_key, a.large_object_key,
                  coalesce(a.small_bytes, 0) + coalesce(a.large_bytes, 0) AS bytes
             FROM luminix.media_items i
             JOIN luminix.media_assets a ON a.clinic_id = i.clinic_id AND a.id = i.asset_id
            WHERE i.clinic_id = $1 AND i.status = $2 AND ($3::uuid IS NULL OR i.folder_id = $3::uuid)
            ORDER BY i.created_at DESC, i.id LIMIT 300`,
          [tenant.clinicId, trash ? 'trashed' : 'active', trash ? null : request.query.folder],
        )
        const ready = privateStorageReady()
        return {
          items: await Promise.all(
            rows.map(async (row) => ({
              id: String(row.id),
              folderId: String(row.folder_id),
              title: row.title ? String(row.title) : '',
              createdAt: new Date(String(row.created_at)).toISOString(),
              bytes: Number(row.bytes),
              thumbUrl: ready ? await privateMediaUrl(String(row.small_object_key)) : null,
              fullUrl: ready ? await privateMediaUrl(String(row.large_object_key)) : null,
            })),
          ),
        }
      }),
  )

  app.post<{ Params: { clinicId: string }; Body: { name: string } }>(
    '/clinics/:clinicId/library/folders',
    {
      schema: {
        params: clinicRefParams,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['name'],
          properties: { name: { type: 'string', minLength: 1, maxLength: 60 } },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'media:manage', async (connection, tenant) => {
        const id = (
          await connection.query(
            'SELECT luminix.save_media_folder($1::uuid, NULL, $2::text) AS id',
            [tenant.clinicId, request.body.name],
          )
        ).rows[0]?.id
        return { id: String(id) }
      }),
  )

  app.put<{ Params: { clinicId: string; folderId: string }; Body: { name: string } }>(
    '/clinics/:clinicId/library/folders/:folderId',
    {
      schema: {
        params: withId('folderId'),
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['name'],
          properties: { name: { type: 'string', minLength: 1, maxLength: 60 } },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'media:manage', async (connection, tenant) => {
        await connection.query('SELECT luminix.save_media_folder($1::uuid, $2::uuid, $3::text)', [
          tenant.clinicId,
          request.params.folderId,
          request.body.name,
        ])
        return { saved: true }
      }),
  )

  app.post<{
    Params: { clinicId: string }
    Body: { folderId: string; assetId: string; title?: string }
  }>(
    '/clinics/:clinicId/library/items',
    {
      schema: {
        params: clinicRefParams,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['folderId', 'assetId'],
          properties: { folderId: uuid, assetId: uuid, title: { type: 'string', maxLength: 120 } },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'media:manage', async (connection, tenant) => {
        const id = (
          await connection.query(
            'SELECT luminix.add_media_item($1::uuid, $2::uuid, $3::uuid, $4::text) AS id',
            [
              tenant.clinicId,
              request.body.folderId,
              request.body.assetId,
              request.body.title ?? null,
            ],
          )
        ).rows[0]?.id
        return { id: String(id) }
      }),
  )

  app.put<{
    Params: { clinicId: string; itemId: string }
    Body: { folderId?: string; title?: string; status?: 'active' | 'trashed' }
  }>(
    '/clinics/:clinicId/library/items/:itemId',
    {
      schema: {
        params: withId('itemId'),
        body: {
          type: 'object',
          additionalProperties: false,
          minProperties: 1,
          properties: {
            folderId: uuid,
            title: { type: 'string', maxLength: 120 },
            status: { type: 'string', enum: ['active', 'trashed'] },
          },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'media:manage', async (connection, tenant) => {
        await connection.query(
          'SELECT luminix.update_media_item($1::uuid, $2::uuid, $3::uuid, $4::text, $5::text)',
          [
            tenant.clinicId,
            request.params.itemId,
            request.body.folderId ?? null,
            request.body.title ?? null,
            request.body.status ?? null,
          ],
        )
        return { saved: true }
      }),
  )
}
