import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { SqlConnection } from '../../shared/database/migrations.js'
import { withClinicTransaction, type TenantPool } from '../../shared/tenant/clinic-transaction.js'
import type { TenantContext } from '../../shared/tenant/tenant-context.js'
import { saveOnboardingDraft } from './onboarding-persist.js'
import { isValidBrazilianTaxId } from './tax-id.js'
import {
  publicMediaUrl,
  uploadMediaVariant,
  verifyMediaVariants,
  type MediaKind,
  type MediaVariant,
} from './media-storage.js'

const onboardingSteps = [
  'contact',
  'clinic',
  'catalog',
  'services',
  'structure',
  'schedule',
  'hours',
  'payments',
  'rules',
  'review',
  'preferences',
] as const

type OnboardingPayload = {
  name: string
  ownerName: string
  email: string
  phone: string
  clinic: {
    foundedYear: string
    whatsapp: string
    instagram: string
    facebook: string
    website: string
    taxId: string
    addressLine: string
    addressNumber?: string
    addressDistrict?: string
    addressNote?: string
    taxIdKind?: 'cpf' | 'cnpj'
    defaultAudience?: 'all' | 'women' | 'men'
    city: string
    state: string
    postalCode: string
    logoAssetId?: string
  }
  uiFocus?: 'address' | 'hours' | 'payments' | 'rules'
  occupations: string[]
  services: {
    id: string
    category: string
    name: string
    description: string
    priceCents: number
    durationMinutes: number
    priceType: 'fixed' | 'from' | 'quote'
    bookingMode: 'instant' | 'request' | 'manual_release'
    audience: 'all' | 'women' | 'men'
    sensitive?: boolean
    resourceName: string
    cancellationHours: number | null
  }[]
  teamMode: 'solo' | 'team'
  professionals: {
    id: string
    name: string
    role: string
    gender: 'female' | 'male'
    audience: 'all' | 'women' | 'men'
    serviceNames: string[]
    serviceIds: string[]
    serviceAudiences?: Record<string, 'all' | 'women' | 'men'>
    photoAssetId?: string
  }[]
  businessHours: {
    weekday: number
    enabled: boolean
    start: string
    end: string
    breaks?: { start: string; end: string }[]
  }[]
  professionalSchedules: {
    professionalId: string
    name: string
    days: {
      weekday: number
      enabled: boolean
      start: string
      end: string
      breaks?: { start: string; end: string }[]
    }[]
  }[]
  preferences: {
    cancellationHours: number
    specialCancellationHours: number
    acceptInApp: boolean
    packagePaymentMode: 'clinic_only' | 'in_app' | 'both'
  }
}

function validPayload(payload: OnboardingPayload): boolean {
  const unique = (names: string[]) =>
    new Set(names.map((name) => name.trim().toLocaleLowerCase('pt-BR'))).size === names.length
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  const clock = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/
  const validDay = (
    day: OnboardingPayload['businessHours'][number],
    clinicDay?: OnboardingPayload['businessHours'][number],
  ) => {
    const breaks = day.breaks ?? []
    if (
      day.weekday < 0 ||
      day.weekday > 6 ||
      !clock.test(day.start) ||
      !clock.test(day.end) ||
      (day.enabled && day.start >= day.end) ||
      breaks.length > 4 ||
      (day.enabled &&
        clinicDay &&
        (!clinicDay.enabled || day.start < clinicDay.start || day.end > clinicDay.end))
    )
      return false
    let cursor = day.start
    return [...breaks]
      .sort((left, right) => left.start.localeCompare(right.start))
      .every((item) => {
        const fits =
          clock.test(item.start) &&
          clock.test(item.end) &&
          item.start < item.end &&
          (!day.enabled || (item.start >= day.start && item.end <= day.end && item.start >= cursor))
        cursor = item.end
        return fits
      })
  }
  const email = payload.email.trim()
  const phone = payload.phone.trim()
  const foundedYear = payload.clinic.foundedYear.trim()
  const whatsapp = payload.clinic.whatsapp.trim()
  const taxKind = payload.clinic.taxIdKind === 'cpf' ? 'cpf' : 'cnpj'
  const serviceIds = new Set(payload.services.map((service) => service.id))
  const professionalIds = new Set(payload.professionals.map((professional) => professional.id))
  const clinicHours = new Map(payload.businessHours.map((day) => [day.weekday, day]))
  return Boolean(
    payload.name.length <= 160 &&
    payload.ownerName.length <= 120 &&
    email.length <= 254 &&
    (!email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) &&
    (!phone || /^\+[1-9][0-9]{7,14}$/.test(phone)) &&
    (!whatsapp || /^\+[1-9][0-9]{7,14}$/.test(whatsapp)) &&
    (!foundedYear ||
      (/^[0-9]{4}$/.test(foundedYear) &&
        Number(foundedYear) >= 1800 &&
        Number(foundedYear) <= 2200)) &&
    (!payload.clinic.taxId || isValidBrazilianTaxId(taxKind, payload.clinic.taxId)) &&
    (!payload.clinic.state || /^[A-Z]{2}$/.test(payload.clinic.state)) &&
    (!payload.clinic.postalCode.trim() ||
      payload.clinic.postalCode.replace(/\D/g, '').length === 8) &&
    unique(payload.occupations) &&
    unique(payload.services.map((service) => service.name)) &&
    serviceIds.size === payload.services.length &&
    payload.occupations.every((name) => name.trim()) &&
    payload.professionals.every(
      (professional) =>
        professional.name.trim() &&
        uuid.test(professional.id) &&
        (professional.gender === 'female' || professional.gender === 'male') &&
        new Set(professional.serviceIds).size === professional.serviceIds.length &&
        professional.serviceIds.every((id) => serviceIds.has(id)) &&
        Object.keys(professional.serviceAudiences ?? {}).every((id) =>
          professional.serviceIds.includes(id),
        ) &&
        Object.values(professional.serviceAudiences ?? {}).every(
          (audience) => audience === 'all' || audience === 'women' || audience === 'men',
        ),
    ) &&
    (!payload.clinic.defaultAudience ||
      payload.clinic.defaultAudience === 'all' ||
      payload.clinic.defaultAudience === 'women' ||
      payload.clinic.defaultAudience === 'men') &&
    payload.services.every((service) => uuid.test(service.id) && service.name.trim()) &&
    payload.businessHours.length === 7 &&
    unique(payload.businessHours.map((day) => String(day.weekday))) &&
    payload.businessHours.every((day) => validDay(day)) &&
    professionalIds.size === payload.professionals.length &&
    (!payload.preferences.acceptInApp
      ? payload.preferences.packagePaymentMode === 'clinic_only'
      : true) &&
    unique((payload.professionalSchedules ?? []).map((entry) => entry.professionalId)) &&
    (professionalIds.size === 0 ||
      (payload.professionalSchedules ?? []).every(
        (entry) =>
          uuid.test(entry.professionalId) &&
          professionalIds.has(entry.professionalId) &&
          entry.name.trim() &&
          entry.days.length === 7 &&
          unique(entry.days.map((day) => String(day.weekday))) &&
          entry.days.every((day) => validDay(day, clinicHours.get(day.weekday))),
      )),
  )
}

function emptyPayload(clinicName: string): OnboardingPayload {
  return {
    name: clinicName,
    ownerName: '',
    email: '',
    phone: '',
    clinic: {
      foundedYear: '',
      whatsapp: '',
      instagram: '',
      facebook: '',
      website: '',
      taxId: '',
      taxIdKind: 'cnpj',
      defaultAudience: 'all',
      addressLine: '',
      addressNumber: '',
      addressDistrict: '',
      addressNote: '',
      city: '',
      state: '',
      postalCode: '',
    },
    occupations: [],
    services: [],
    teamMode: 'solo',
    professionals: [],
    businessHours: [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({
      weekday,
      enabled: weekday >= 1 && weekday <= 5,
      start: '09:00',
      end: weekday === 6 ? '13:00' : '18:00',
      breaks: [],
    })),
    professionalSchedules: [],
    preferences: {
      cancellationHours: 12,
      specialCancellationHours: 24,
      acceptInApp: false,
      packagePaymentMode: 'clinic_only',
    },
  }
}

export async function clinicRoutes(
  app: FastifyInstance,
  authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<string | null>,
  pool: TenantPool | undefined,
) {
  const params = {
    type: 'object',
    additionalProperties: false,
    required: ['clinicId'],
    properties: {
      clinicId: {
        type: 'string',
        pattern:
          '^(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|[A-Za-z]{2}-[0-9]{4})$',
      },
    },
  }
  async function authorized(
    request: FastifyRequest<{ Params: { clinicId: string } }>,
    reply: FastifyReply,
    permission: string | null,
    work: (connection: SqlConnection, tenant: TenantContext) => Promise<unknown>,
  ) {
    const identityId = await authenticate(request, reply)
    if (!identityId) return
    if (!pool) return reply.code(503).send({ error: 'Clinic unavailable' })
    try {
      return await withClinicTransaction(
        pool,
        identityId,
        request.params.clinicId,
        permission,
        async (connection, tenant) => {
          request.tenantContext = tenant
          try {
            return await work(connection, tenant)
          } finally {
            request.tenantContext = null
          }
        },
      )
    } catch (error) {
      const statusCode = (error as { statusCode?: number })?.statusCode
      if (statusCode && [400, 409, 413].includes(statusCode))
        return reply.code(statusCode).send({ error: (error as Error).message })
      if ((error as { statusCode?: number })?.statusCode === 403) {
        request.log.info({ event: 'clinic_access_denied' })
        return reply.code(403).send({ error: 'Clinic access denied' })
      }
      if ((error as { code?: string })?.code === '23505')
        return reply.code(409).send({ error: 'Onboarding changed; reload before retrying' })
      if (['22023', '22P02', '23514'].includes((error as { code?: string })?.code ?? ''))
        return reply.code(400).send({ error: 'Invalid onboarding data' })
      request.log.warn({ event: 'clinic_read_unavailable' })
      return reply.code(503).send({ error: 'Clinic unavailable' })
    }
  }
  app.get<{ Params: { clinicId: string } }>(
    '/clinics/:clinicId/context',
    { schema: { params } },
    async (request, reply) =>
      authorized(request, reply, null, async (connection, tenant) => {
        const clinic = (
          await connection.query(
            'SELECT id, name, slug, status, share_code FROM luminix.clinics WHERE id = $1',
            [tenant.clinicId],
          )
        ).rows[0]
        const grants = (
          await connection.query(
            'SELECT permission_code FROM luminix.role_permissions WHERE clinic_id = $1 AND role_id = $2 ORDER BY permission_code',
            [tenant.clinicId, tenant.role],
          )
        ).rows
        if (!clinic) throw new Error('Clinic unavailable')
        return { clinic, permissions: grants.map((grant) => String(grant.permission_code)) }
      }),
  )

  const mediaParams = {
    type: 'object',
    additionalProperties: false,
    required: ['clinicId', 'assetId', 'action'],
    properties: {
      clinicId: params.properties.clinicId,
      assetId: { type: 'string', format: 'uuid' },
      action: { type: 'string', enum: ['small', 'large', 'finalize'] },
    },
  } as const
  app.post<{
    Params: { clinicId: string }
    Body: { kind: MediaKind; subjectRef?: string }
  }>(
    '/clinics/:clinicId/media',
    {
      schema: {
        params,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['kind'],
          properties: {
            kind: { type: 'string', enum: ['clinic_logo', 'professional_photo'] },
            subjectRef: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) =>
      authorized(
        request,
        reply,
        request.body.kind === 'clinic_logo' ? 'settings:manage' : 'professional:manage',
        async (connection, tenant) => {
          const row = (
            await connection.query(
              'SELECT * FROM luminix.begin_media_upload($1::uuid, $2::text, $3::uuid)',
              [tenant.clinicId, request.body.kind, request.body.subjectRef ?? null],
            )
          ).rows[0]
          return { asset: { id: String(row.asset_id), status: String(row.asset_status) } }
        },
      ),
  )
  app.put<{
    Params: { clinicId: string; assetId: string; action: MediaVariant }
    Body: Buffer
  }>(
    '/clinics/:clinicId/media/:assetId/:action',
    { bodyLimit: 2_500_000, schema: { params: mediaParams } },
    async (request, reply) => {
      if (!['small', 'large'].includes(request.params.action))
        return reply.code(404).send({ error: 'Not found' })
      if (!Buffer.isBuffer(request.body) || request.headers['content-type'] !== 'image/webp')
        return reply.code(400).send({ error: 'Invalid image' })
      return authorized(request, reply, null, async (connection, tenant) => {
        const asset = (
          await connection.query(
            'SELECT id, kind, subject_ref, status FROM luminix.media_assets WHERE clinic_id = $1 AND id = $2',
            [tenant.clinicId, request.params.assetId],
          )
        ).rows[0]
        if (!asset || asset.status !== 'pending')
          throw Object.assign(new Error('Media upload unavailable'), { statusCode: 409 })
        const permission = asset.kind === 'clinic_logo' ? 'settings:manage' : 'professional:manage'
        await connection.query(
          'SELECT * FROM luminix.authorize_staff_clinic($1::uuid, $2::uuid, $3::text)',
          [tenant.userId, tenant.clinicId, permission],
        )
        const uploaded = await uploadMediaVariant({
          clinicId: tenant.clinicId,
          assetId: request.params.assetId,
          kind: asset.kind as MediaKind,
          subjectRef: asset.subject_ref ? String(asset.subject_ref) : null,
          variant: request.params.action,
          body: request.body,
        })
        return { variant: request.params.action, bytes: uploaded.bytes }
      })
    },
  )
  app.post<{
    Params: { clinicId: string; assetId: string; action: 'finalize' }
    Body: Record<string, never>
  }>(
    '/clinics/:clinicId/media/:assetId/:action',
    {
      schema: {
        params: mediaParams,
        body: { type: 'object', additionalProperties: false },
      },
    },
    async (request, reply) => {
      if (request.params.action !== 'finalize') return reply.code(404).send({ error: 'Not found' })
      return authorized(request, reply, null, async (connection, tenant) => {
        const asset = (
          await connection.query(
            'SELECT id, kind, subject_ref, status FROM luminix.media_assets WHERE clinic_id = $1 AND id = $2',
            [tenant.clinicId, request.params.assetId],
          )
        ).rows[0]
        if (!asset || asset.status !== 'pending')
          throw Object.assign(new Error('Media upload unavailable'), { statusCode: 409 })
        const variants = await verifyMediaVariants({
          clinicId: tenant.clinicId,
          assetId: request.params.assetId,
          kind: asset.kind as MediaKind,
          subjectRef: asset.subject_ref ? String(asset.subject_ref) : null,
        })
        const ready = (
          await connection.query(
            'SELECT * FROM luminix.complete_media_upload($1::uuid, $2::uuid, $3::integer, $4::integer)',
            [tenant.clinicId, request.params.assetId, variants.small.bytes, variants.large.bytes],
          )
        ).rows[0]
        return {
          asset: {
            id: String(ready.asset_id),
            status: String(ready.asset_status),
            smallUrl: publicMediaUrl(String(ready.small_object_key)),
            largeUrl: publicMediaUrl(String(ready.large_object_key)),
          },
        }
      })
    },
  )
  app.get<{ Params: { clinicId: string } }>(
    '/clinics/:clinicId/settings',
    { schema: { params } },
    async (request, reply) =>
      authorized(request, reply, 'settings:manage', async (connection, tenant) => {
        const settings = (
          await connection.query(
            `SELECT s.timezone, s.locale, s.currency,
                    p.owner_name, p.contact_email, p.contact_phone,
                    logo.small_object_key AS logo_key
               FROM luminix.clinic_settings s
               LEFT JOIN luminix.clinic_profiles p ON p.clinic_id = s.clinic_id
               LEFT JOIN luminix.media_assets logo
                 ON logo.clinic_id = p.clinic_id AND logo.id = p.logo_asset_id
              WHERE s.clinic_id = $1`,
            [tenant.clinicId],
          )
        ).rows[0]
        if (!settings) throw new Error('Settings unavailable')
        return {
          settings: {
            timezone: settings.timezone,
            locale: settings.locale,
            currency: settings.currency,
          },
          profile: settings.owner_name
            ? {
                ownerName: settings.owner_name,
                email: settings.contact_email,
                phone: settings.contact_phone,
                logoUrl: settings.logo_key ? publicMediaUrl(String(settings.logo_key)) : null,
              }
            : null,
        }
      }),
  )

  const onboardingPayloadSchema = {
    type: 'object',
    additionalProperties: false,
    required: [
      'name',
      'ownerName',
      'email',
      'phone',
      'clinic',
      'occupations',
      'services',
      'teamMode',
      'professionals',
      'businessHours',
      'professionalSchedules',
      'preferences',
    ],
    properties: {
      name: { type: 'string', minLength: 0, maxLength: 160 },
      ownerName: { type: 'string', minLength: 0, maxLength: 120 },
      email: { type: 'string', minLength: 0, maxLength: 254 },
      phone: { type: 'string', minLength: 0, maxLength: 16, pattern: '^$|^\\+[1-9][0-9]{7,14}$' },
      clinic: {
        type: 'object',
        additionalProperties: false,
        required: [
          'foundedYear',
          'whatsapp',
          'instagram',
          'facebook',
          'website',
          'taxId',
          'addressLine',
          'addressNumber',
          'addressDistrict',
          'addressNote',
          'taxIdKind',
          'defaultAudience',
          'city',
          'state',
          'postalCode',
        ],
        properties: {
          foundedYear: { type: 'string', maxLength: 4, pattern: '^$|^[0-9]{4}$' },
          whatsapp: { type: 'string', maxLength: 16, pattern: '^$|^\\+[1-9][0-9]{7,14}$' },
          instagram: { type: 'string', maxLength: 120 },
          facebook: { type: 'string', maxLength: 300 },
          website: { type: 'string', maxLength: 300 },
          taxId: { type: 'string', maxLength: 18 },
          addressLine: { type: 'string', maxLength: 240 },
          addressNumber: { type: 'string', maxLength: 20 },
          addressDistrict: { type: 'string', maxLength: 120 },
          addressNote: { type: 'string', maxLength: 240 },
          taxIdKind: { type: 'string', enum: ['cpf', 'cnpj'] },
          defaultAudience: { type: 'string', enum: ['all', 'women', 'men'] },
          city: { type: 'string', maxLength: 120 },
          state: { type: 'string', maxLength: 2, pattern: '^$|^[A-Z]{2}$' },
          postalCode: { type: 'string', maxLength: 9, pattern: '^$|^[0-9-]{1,9}$' },
          logoAssetId: { type: 'string', format: 'uuid' },
        },
      },
      occupations: {
        type: 'array',
        maxItems: 20,
        items: { type: 'string', minLength: 1, maxLength: 120 },
      },
      services: {
        type: 'array',
        maxItems: 80,
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'id',
            'category',
            'name',
            'description',
            'priceCents',
            'durationMinutes',
            'priceType',
            'bookingMode',
            'audience',
            'resourceName',
            'cancellationHours',
          ],
          properties: {
            id: { type: 'string', format: 'uuid' },
            category: { type: 'string', minLength: 1, maxLength: 120 },
            name: { type: 'string', minLength: 1, maxLength: 160 },
            description: { type: 'string', maxLength: 1200 },
            priceCents: { type: 'integer', minimum: 0, maximum: 999999999 },
            durationMinutes: { type: 'integer', minimum: 1, maximum: 1440 },
            priceType: { type: 'string', enum: ['fixed', 'from', 'quote'] },
            bookingMode: { type: 'string', enum: ['instant', 'request', 'manual_release'] },
            audience: { type: 'string', enum: ['all', 'women', 'men'] },
            sensitive: { type: 'boolean' },
            resourceName: { type: 'string', maxLength: 160 },
            cancellationHours: {
              anyOf: [{ type: 'integer', minimum: 0, maximum: 168 }, { type: 'null' }],
            },
          },
        },
      },
      teamMode: { type: 'string', enum: ['solo', 'team'] },
      professionals: {
        type: 'array',
        maxItems: 30,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'name', 'role', 'gender', 'audience', 'serviceNames', 'serviceIds'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string', minLength: 1, maxLength: 160 },
            role: { type: 'string', minLength: 1, maxLength: 120 },
            gender: { type: 'string', enum: ['female', 'male'] },
            audience: { type: 'string', enum: ['all', 'women', 'men'] },
            serviceNames: {
              type: 'array',
              maxItems: 80,
              items: { type: 'string', minLength: 1, maxLength: 160 },
            },
            serviceIds: {
              type: 'array',
              maxItems: 80,
              items: { type: 'string', format: 'uuid' },
            },
            serviceAudiences: {
              type: 'object',
              maxProperties: 80,
              additionalProperties: { type: 'string', enum: ['all', 'women', 'men'] },
            },
            photoAssetId: { type: 'string', format: 'uuid' },
          },
        },
      },
      businessHours: {
        type: 'array',
        minItems: 7,
        maxItems: 7,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['weekday', 'enabled', 'start', 'end'],
          properties: {
            weekday: { type: 'integer', minimum: 0, maximum: 6 },
            enabled: { type: 'boolean' },
            start: { type: 'string', pattern: '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' },
            end: { type: 'string', pattern: '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' },
            breaks: {
              type: 'array',
              maxItems: 4,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['start', 'end'],
                properties: {
                  start: { type: 'string', pattern: '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' },
                  end: { type: 'string', pattern: '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' },
                },
              },
            },
          },
        },
      },
      uiFocus: { type: 'string', enum: ['address', 'hours', 'payments', 'rules'] },
      professionalSchedules: {
        type: 'array',
        maxItems: 30,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['professionalId', 'name', 'days'],
          properties: {
            professionalId: { type: 'string', format: 'uuid' },
            name: { type: 'string', minLength: 1, maxLength: 160 },
            days: {
              type: 'array',
              minItems: 7,
              maxItems: 7,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['weekday', 'enabled', 'start', 'end'],
                properties: {
                  weekday: { type: 'integer', minimum: 0, maximum: 6 },
                  enabled: { type: 'boolean' },
                  start: { type: 'string', pattern: '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' },
                  end: { type: 'string', pattern: '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' },
                  breaks: {
                    type: 'array',
                    maxItems: 4,
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      required: ['start', 'end'],
                      properties: {
                        start: {
                          type: 'string',
                          pattern: '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$',
                        },
                        end: { type: 'string', pattern: '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      preferences: {
        type: 'object',
        additionalProperties: false,
        required: [
          'cancellationHours',
          'specialCancellationHours',
          'acceptInApp',
          'packagePaymentMode',
        ],
        properties: {
          cancellationHours: { type: 'integer', minimum: 0, maximum: 168 },
          specialCancellationHours: { type: 'integer', minimum: 0, maximum: 336 },
          acceptInApp: { type: 'boolean' },
          packagePaymentMode: { type: 'string', enum: ['clinic_only', 'in_app', 'both'] },
        },
      },
    },
  } as const
  app.get<{ Params: { clinicId: string } }>(
    '/clinics/:clinicId/onboarding',
    { schema: { params } },
    async (request, reply) =>
      authorized(request, reply, 'onboarding:manage', async (connection, tenant) => {
        const draft = (
          await connection.query(
            'SELECT version, format_version, step, status, payload FROM luminix.onboarding_drafts WHERE clinic_id = $1',
            [tenant.clinicId],
          )
        ).rows[0]
        const clinic = (
          await connection.query('SELECT name, status FROM luminix.clinics WHERE id = $1', [
            tenant.clinicId,
          ])
        ).rows[0]
        if (!clinic) throw new Error('Clinic unavailable')
        return {
          draft: draft
            ? {
                version: Number(draft.version),
                formatVersion: 3,
                step: draft.step,
                status: draft.status,
                payload: {
                  ...emptyPayload(String(clinic.name)),
                  ...(draft.payload &&
                  typeof draft.payload === 'object' &&
                  !Array.isArray(draft.payload)
                    ? draft.payload
                    : {}),
                },
              }
            : {
                version: 0,
                formatVersion: 3,
                step: 'contact',
                status: 'draft',
                payload: emptyPayload(String(clinic.name)),
              },
        }
      }),
  )
  app.put<{
    Params: { clinicId: string }
    Body: { version: number; step: string; payload: OnboardingPayload }
  }>(
    '/clinics/:clinicId/onboarding',
    {
      bodyLimit: 131072,
      schema: {
        params,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['version', 'step', 'payload'],
          properties: {
            version: { type: 'integer', minimum: 0 },
            step: {
              type: 'string',
              enum: [...onboardingSteps],
            },
            payload: onboardingPayloadSchema,
          },
        },
      },
    },
    async (request, reply) => {
      if (!validPayload(request.body.payload))
        return reply.code(400).send({ error: 'Invalid onboarding data' })
      return authorized(request, reply, 'onboarding:manage', async (connection, tenant) => {
        const row = await saveOnboardingDraft(
          connection,
          tenant.clinicId,
          request.body.version,
          request.body.step,
          request.body.payload,
        )
        return {
          draft: {
            version: Number(row.draft_version),
            formatVersion: 3,
            step: row.draft_step,
            status: 'draft',
            payload: row.draft_payload,
          },
        }
      })
    },
  )
  app.post<{ Params: { clinicId: string }; Body: { version: number } }>(
    '/clinics/:clinicId/onboarding/complete',
    {
      schema: {
        params,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['version'],
          properties: { version: { type: 'integer', minimum: 1 } },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'onboarding:manage', async (connection, tenant) => {
        const row = (
          await connection.query(
            'SELECT * FROM luminix.complete_onboarding($1::uuid, $2::integer)',
            [tenant.clinicId, request.body.version],
          )
        ).rows[0]
        return {
          clinic: {
            id: tenant.clinicId,
            name: row.clinic_name,
            status: row.clinic_status,
            shareCode: row.clinic_share_code,
          },
          version: Number(row.draft_version),
          replayed: row.replayed,
        }
      }),
  )
  app.get<{ Params: { clinicId: string } }>(
    '/clinics/:clinicId/overview',
    { schema: { params } },
    async (request, reply) =>
      authorized(request, reply, 'clinic:manage', async (connection, tenant) => {
        const occupations = await connection.query(
          'SELECT name FROM luminix.occupations WHERE clinic_id = $1 ORDER BY name LIMIT 30',
          [tenant.clinicId],
        )
        const services = await connection.query(
          'SELECT name, price_cents, duration_minutes FROM luminix.services WHERE clinic_id = $1 AND status = $2 ORDER BY name LIMIT 30',
          [tenant.clinicId, 'active'],
        )
        const professionals = await connection.query(
          `SELECT p.display_name, photo.small_object_key AS photo_key
             FROM luminix.professionals p
             LEFT JOIN luminix.media_assets photo
               ON photo.clinic_id = p.clinic_id AND photo.id = p.photo_asset_id
            WHERE p.clinic_id = $1 AND p.status = $2 ORDER BY p.display_name LIMIT 20`,
          [tenant.clinicId, 'active'],
        )
        const clinic = await connection.query(
          'SELECT name, status, share_code FROM luminix.clinics WHERE id = $1',
          [tenant.clinicId],
        )
        return {
          clinic: clinic.rows[0],
          occupations: occupations.rows,
          services: services.rows,
          professionals: professionals.rows.map((professional) => ({
            display_name: professional.display_name,
            photo_url: professional.photo_key
              ? publicMediaUrl(String(professional.photo_key))
              : null,
          })),
        }
      }),
  )
}
