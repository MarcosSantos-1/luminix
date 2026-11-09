import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { SqlConnection } from '../../shared/database/migrations.js'
import type { TenantContext } from '../../shared/tenant/tenant-context.js'
import { publicMediaUrl } from './media-storage.js'
import { invalidatePublicClinic } from './public-cache.js'

type Authorized = (
  request: FastifyRequest<{ Params: { clinicId: string } }>,
  reply: FastifyReply,
  permission: string | null,
  work: (connection: SqlConnection, tenant: TenantContext) => Promise<unknown>,
  beforeWrite?: (identityId: string) => Promise<void>,
  affectsPublicPage?: boolean,
) => Promise<unknown>

const slugPattern = '^[a-z0-9]+(-[a-z0-9]+)*$'
const phone = { type: 'string', maxLength: 16, pattern: '^\\+[1-9][0-9]{7,14}$' }
const optionalPhone = { type: 'string', maxLength: 16, pattern: '^$|^\\+[1-9][0-9]{7,14}$' }
const nullableHours = (maximum: number) => ({
  anyOf: [{ type: 'integer', minimum: 0, maximum }, { type: 'null' }],
})
const nullablePercent = { anyOf: [{ type: 'integer', minimum: 0, maximum: 100 }, { type: 'null' }] }

function maskTaxId(value: unknown) {
  const digits = typeof value === 'string' ? value.replace(/\D/g, '') : ''
  return digits.length >= 4 ? `•••${digits.slice(-4)}` : null
}

/** Post-onboarding editing. Every write runs a definer function that re-checks settings:manage. */
export function clinicSettingsRoutes(
  app: FastifyInstance,
  authorized: Authorized,
  params: Record<string, unknown>,
) {
  app.get<{ Params: { clinicId: string } }>(
    '/clinics/:clinicId/profile',
    { schema: { params } },
    async (request, reply) =>
      authorized(request, reply, 'settings:manage', async (connection, tenant) => {
        const row = (
          await connection.query(
            `SELECT c.name, c.slug, c.status, c.share_code, s.locale, s.timezone, s.currency,
                    p.owner_name, p.contact_email, p.contact_phone, p.whatsapp_phone,
                    p.founded_year, p.instagram, p.facebook, p.website, p.tax_id, p.tax_id_kind,
                    p.logo_asset_id, logo.large_object_key AS logo_key,
                    l.address_line, l.address_number, l.district, l.address_note, l.city,
                    l.state, l.postal_code
               FROM luminix.clinics c
               JOIN luminix.clinic_settings s ON s.clinic_id = c.id
               LEFT JOIN luminix.clinic_profiles p ON p.clinic_id = c.id
               LEFT JOIN luminix.locations l ON l.clinic_id = c.id AND l.is_primary
               LEFT JOIN luminix.media_assets logo ON logo.clinic_id = c.id
                 AND logo.id = p.logo_asset_id AND logo.status = 'ready'
              WHERE c.id = $1`,
            [tenant.clinicId],
          )
        ).rows[0]
        if (!row) throw new Error('Clinic unavailable')
        const text = (value: unknown) => (value == null ? '' : String(value))
        return {
          clinic: {
            name: text(row.name),
            slug: text(row.slug),
            status: text(row.status),
            shareCode: row.share_code ? String(row.share_code) : null,
          },
          region: { locale: row.locale, timezone: row.timezone, currency: row.currency },
          profile: row.owner_name
            ? {
                name: text(row.name),
                ownerName: text(row.owner_name),
                email: text(row.contact_email),
                phone: text(row.contact_phone),
                whatsapp: text(row.whatsapp_phone),
                foundedYear: text(row.founded_year),
                instagram: text(row.instagram),
                facebook: text(row.facebook),
                website: text(row.website),
                logoAssetId: row.logo_key ? text(row.logo_asset_id) : '',
                logoUrl: row.logo_key ? publicMediaUrl(String(row.logo_key)) : null,
                taxId: maskTaxId(row.tax_id),
                taxIdKind: row.tax_id_kind ?? null,
                addressLine: text(row.address_line),
                addressNumber: text(row.address_number),
                addressDistrict: text(row.district),
                addressNote: text(row.address_note),
                city: text(row.city),
                state: text(row.state),
                postalCode: text(row.postal_code),
              }
            : null,
        }
      }),
  )

  app.put<{ Params: { clinicId: string }; Body: Record<string, string> }>(
    '/clinics/:clinicId/profile',
    {
      schema: {
        params,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'ownerName', 'email', 'phone'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 160 },
            ownerName: { type: 'string', minLength: 1, maxLength: 120 },
            email: { type: 'string', minLength: 3, maxLength: 254 },
            phone,
            whatsapp: optionalPhone,
            foundedYear: { type: 'string', maxLength: 4, pattern: '^$|^[0-9]{4}$' },
            instagram: { type: 'string', maxLength: 120 },
            facebook: { type: 'string', maxLength: 300 },
            website: { type: 'string', maxLength: 300 },
            logoAssetId: { type: 'string', pattern: '^$|^[0-9a-fA-F-]{36}$' },
            addressLine: { type: 'string', maxLength: 240 },
            addressNumber: { type: 'string', maxLength: 20 },
            addressDistrict: { type: 'string', maxLength: 120 },
            addressNote: { type: 'string', maxLength: 240 },
            city: { type: 'string', maxLength: 120 },
            state: { type: 'string', maxLength: 2, pattern: '^$|^[A-Za-z]{2}$' },
            postalCode: { type: 'string', maxLength: 9, pattern: '^$|^[0-9-]{1,9}$' },
          },
        },
      },
    },
    async (request, reply) =>
      authorized(
        request,
        reply,
        'settings:manage',
        async (connection, tenant) => {
          await connection.query('SELECT luminix.update_clinic_profile($1::uuid, $2::jsonb)', [
            tenant.clinicId,
            JSON.stringify(request.body),
          ])
          return { saved: true }
        },
        undefined,
        true,
      ),
  )

  app.get<{ Params: { clinicId: string } }>(
    '/clinics/:clinicId/booking-rules',
    { schema: { params } },
    async (request, reply) =>
      authorized(request, reply, 'settings:manage', async (connection, tenant) => {
        const [rules, services, payments] = await Promise.all([
          connection.query(
            `SELECT booking_notice_minutes, booking_window_days, cancellation_notice_minutes,
                    special_cancellation_notice_minutes, rescheduling_notice_minutes,
                    client_instructions, late_change_retention_percent, no_show_retention_percent,
                    deposit_scope, deposit_percent, deposit_threshold_cents
               FROM luminix.booking_policies WHERE clinic_id = $1`,
            [tenant.clinicId],
          ),
          connection.query(
            `SELECT id, name, coalesce(category, 'Cuidados') AS category, description, price_cents,
                    duration_minutes, price_type, booking_mode, audience, is_sensitive,
                    cancellation_notice_minutes, deposit_required,
                    late_change_retention_percent, no_show_retention_percent
               FROM luminix.services WHERE clinic_id = $1 AND status = 'active'
              ORDER BY category, name, id LIMIT 80`,
            [tenant.clinicId],
          ),
          connection.query(
            'SELECT accept_in_app FROM luminix.payment_preferences WHERE clinic_id = $1',
            [tenant.clinicId],
          ),
        ])
        const row = rules.rows[0]
        if (!row) return { rules: null, services: [], acceptInApp: false }
        const hours = (minutes: unknown) => (minutes == null ? null : Number(minutes) / 60)
        return {
          acceptInApp: payments.rows[0]?.accept_in_app === true,
          rules: {
            bookingNoticeHours: hours(row.booking_notice_minutes) ?? 1,
            bookingWindowDays:
              row.booking_window_days == null ? 30 : Number(row.booking_window_days),
            cancellationHours: hours(row.cancellation_notice_minutes) ?? 4,
            specialCancellationHours: hours(row.special_cancellation_notice_minutes) ?? 24,
            reschedulingHours: hours(row.rescheduling_notice_minutes),
            clientInstructions: String(row.client_instructions ?? ''),
            lateChangeRetentionPercent: Number(row.late_change_retention_percent ?? 0),
            noShowRetentionPercent: Number(row.no_show_retention_percent ?? 0),
            depositScope: row.deposit_scope,
            depositPercent: Number(row.deposit_percent),
            depositThresholdCents: Number(row.deposit_threshold_cents),
          },
          services: services.rows.map((service) => ({
            id: String(service.id),
            name: String(service.name),
            category: String(service.category),
            description: String(service.description ?? ''),
            priceCents: Number(service.price_cents),
            durationMinutes: Number(service.duration_minutes),
            priceType: service.price_type,
            bookingMode: service.booking_mode,
            audience: service.audience,
            sensitive: service.is_sensitive === true,
            resourceName: '',
            cancellationHours: hours(service.cancellation_notice_minutes),
            depositRequired: service.deposit_required === true,
            lateChangeRetentionPercent:
              service.late_change_retention_percent == null
                ? null
                : Number(service.late_change_retention_percent),
            noShowRetentionPercent:
              service.no_show_retention_percent == null
                ? null
                : Number(service.no_show_retention_percent),
          })),
        }
      }),
  )

  app.put<{ Params: { clinicId: string }; Body: Record<string, unknown> }>(
    '/clinics/:clinicId/booking-rules',
    {
      schema: {
        params,
        body: {
          type: 'object',
          additionalProperties: false,
          required: [
            'bookingNoticeHours',
            'bookingWindowDays',
            'cancellationHours',
            'specialCancellationHours',
            'reschedulingHours',
            'clientInstructions',
            'lateChangeRetentionPercent',
            'noShowRetentionPercent',
            'depositScope',
            'depositPercent',
            'depositThresholdCents',
            'services',
          ],
          properties: {
            bookingNoticeHours: { type: 'integer', minimum: 0, maximum: 168 },
            bookingWindowDays: { type: 'integer', minimum: 7, maximum: 365 },
            cancellationHours: { type: 'integer', minimum: 0, maximum: 168 },
            specialCancellationHours: { type: 'integer', minimum: 0, maximum: 336 },
            reschedulingHours: nullableHours(336),
            clientInstructions: { type: 'string', maxLength: 500 },
            lateChangeRetentionPercent: { type: 'integer', minimum: 0, maximum: 100 },
            noShowRetentionPercent: { type: 'integer', minimum: 0, maximum: 100 },
            depositScope: {
              type: 'string',
              enum: ['none', 'all', 'threshold', 'special', 'selected'],
            },
            depositPercent: { type: 'integer', minimum: 1, maximum: 100 },
            depositThresholdCents: { type: 'integer', minimum: 1, maximum: 100000000 },
            services: {
              type: 'array',
              maxItems: 80,
              items: {
                type: 'object',
                additionalProperties: false,
                required: [
                  'id',
                  'depositRequired',
                  'lateChangeRetentionPercent',
                  'noShowRetentionPercent',
                ],
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  depositRequired: { type: 'boolean' },
                  lateChangeRetentionPercent: nullablePercent,
                  noShowRetentionPercent: nullablePercent,
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'settings:manage', async (connection, tenant) => {
        await connection.query('SELECT luminix.update_booking_rules($1::uuid, $2::jsonb)', [
          tenant.clinicId,
          JSON.stringify(request.body),
        ])
        return { saved: true }
      }),
  )

  app.get<{ Params: { clinicId: string }; Querystring: { check?: string; from?: string } }>(
    '/clinics/:clinicId/slug',
    {
      schema: {
        params,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            check: { type: 'string', maxLength: 40 },
            from: { type: 'string', maxLength: 160 },
          },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'settings:manage', async (connection, tenant) => {
        const current = (
          await connection.query('SELECT slug FROM luminix.clinics WHERE id = $1', [
            tenant.clinicId,
          ])
        ).rows[0]
        const history = await connection.query(
          'SELECT slug FROM luminix.clinic_slug_history WHERE clinic_id = $1 ORDER BY replaced_at DESC LIMIT 10',
          [tenant.clinicId],
        )
        const check = request.query.check?.trim().toLowerCase()
        let problem: string | null | undefined
        if (check) {
          problem = (
            await connection.query(
              'SELECT problem FROM luminix.check_clinic_slugs($1::uuid, ARRAY[$2::text])',
              [tenant.clinicId, check],
            )
          ).rows[0]?.problem as string | null
        }
        const suggestion =
          request.query.from !== undefined || (check && problem && problem !== 'invalid')
            ? String(
                (
                  await connection.query(
                    'SELECT luminix.suggest_clinic_slug($1::uuid, $2::text) AS slug',
                    [tenant.clinicId, request.query.from ?? check],
                  )
                ).rows[0]?.slug ?? '',
              ) || null
            : null
        return {
          slug: String(current?.slug ?? ''),
          previous: history.rows.map((row) => String(row.slug)),
          ...(check ? { check: { slug: check, available: problem == null, problem } } : {}),
          suggestion,
        }
      }),
  )

  app.put<{ Params: { clinicId: string }; Body: { slug: string } }>(
    '/clinics/:clinicId/slug',
    {
      schema: {
        params,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['slug'],
          properties: {
            slug: { type: 'string', minLength: 3, maxLength: 40, pattern: slugPattern },
          },
        },
      },
    },
    async (request, reply) => {
      let previous: string | undefined
      const result = await authorized(
        request,
        reply,
        'settings:manage',
        async (connection, tenant) => {
          previous = String(
            (
              await connection.query('SELECT slug FROM luminix.clinics WHERE id = $1', [
                tenant.clinicId,
              ])
            ).rows[0]?.slug ?? '',
          )
          try {
            const slug = (
              await connection.query('SELECT luminix.set_clinic_slug($1::uuid, $2::text) AS slug', [
                tenant.clinicId,
                request.body.slug,
              ])
            ).rows[0]?.slug
            return { slug, previous }
          } catch (error) {
            const code = (error as { code?: string }).code
            const message = (error as Error).message ?? ''
            if (code === '54000')
              throw Object.assign(new Error('Slug change limit'), { statusCode: 409 })
            if (code === '22023' && /^Slug (taken|reserved|invalid)$/.test(message))
              throw Object.assign(new Error(message), { statusCode: 409 })
            if (code === '23505') throw Object.assign(new Error('Slug taken'), { statusCode: 409 })
            throw error
          }
        },
        undefined,
        true,
      )
      // The new address is invalidated by `authorized`; the old one must stop serving now too.
      if (previous && previous !== request.body.slug && reply.statusCode < 300)
        await invalidatePublicClinic(previous, request.log)
      return result
    },
  )

  app.get<{ Params: { clinicId: string } }>(
    '/clinics/:clinicId/showcase/preview',
    { schema: { params } },
    async (request, reply) =>
      authorized(request, reply, 'settings:manage', async (connection, tenant) => {
        const [projection, publication] = await Promise.all([
          connection.query('SELECT luminix.read_clinic_preview($1::uuid) AS clinic', [
            tenant.clinicId,
          ]),
          connection.query(
            `SELECT coalesce(public_enabled, false) AS enabled,
                    coalesce(public_address, false) AS address,
                    coalesce(public_contacts, false) AS contacts
               FROM luminix.clinic_profiles WHERE clinic_id = $1`,
            [tenant.clinicId],
          ),
        ])
        const clinic = projection.rows[0]?.clinic as Record<string, unknown> | null
        if (!clinic) throw new Error('Clinic unavailable')
        return {
          clinic: publicClinicResponse(clinic),
          publication: publication.rows[0] ?? { enabled: false, address: false, contacts: false },
        }
      }),
  )
}

/** Converts storage keys from the SQL projection into public media URLs. */
export function publicClinicResponse(clinic: Record<string, unknown>) {
  const { logoKey, galleryKeys, featured, servicePhotos, ...publicFields } = clinic
  return {
    ...publicFields,
    logoUrl: typeof logoKey === 'string' ? publicMediaUrl(logoKey) : null,
    gallery: (galleryKeys as string[] | undefined)?.map(publicMediaUrl) ?? [],
    servicePhotos:
      (servicePhotos as { serviceId: string; photoKey: string }[] | undefined)?.map(
        ({ serviceId, photoKey }) => ({ serviceId, photoUrl: publicMediaUrl(photoKey) }),
      ) ?? [],
    featured:
      (featured as { serviceId: string; photoKey: string | null }[] | undefined)?.map(
        ({ serviceId, photoKey }) => ({
          serviceId,
          photoUrl: photoKey ? publicMediaUrl(photoKey) : null,
        }),
      ) ?? [],
  }
}
