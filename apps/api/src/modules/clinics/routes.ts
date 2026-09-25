import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { SqlConnection } from '../../shared/database/migrations.js'
import { withClinicTransaction, type TenantPool } from '../../shared/tenant/clinic-transaction.js'
import type { TenantContext } from '../../shared/tenant/tenant-context.js'

const onboardingSteps = [
  'contact',
  'clinic',
  'catalog',
  'services',
  'structure',
  'schedule',
  'preferences',
  'review',
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
    addressNote?: string
    taxIdKind?: 'cpf' | 'cnpj'
    city: string
    state: string
    postalCode: string
  }
  uiFocus?: 'address' | 'hours'
  occupations: string[]
  services: {
    category: string
    name: string
    description: string
    priceCents: number
    durationMinutes: number
    priceType: 'fixed' | 'from' | 'quote'
    bookingMode: 'instant' | 'request' | 'manual_release'
    audience: 'all' | 'women' | 'men'
    resourceName: string
    cancellationHours: number | null
  }[]
  teamMode: 'solo' | 'team'
  professionals: {
    name: string
    role: string
    audience: 'all' | 'women' | 'men'
    serviceNames: string[]
  }[]
  businessHours: { weekday: number; enabled: boolean; start: string; end: string }[]
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
  const email = payload.email.trim()
  const phone = payload.phone.trim()
  const foundedYear = payload.clinic.foundedYear.trim()
  const whatsapp = payload.clinic.whatsapp.trim()
  const taxDigits = payload.clinic.taxId.replace(/\D/g, '')
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
    (!payload.clinic.taxId || (taxDigits.length >= 11 && taxDigits.length <= 14)) &&
    (!payload.clinic.state || /^[A-Z]{2}$/.test(payload.clinic.state)) &&
    (!payload.clinic.postalCode || /^[0-9-]{8,9}$/.test(payload.clinic.postalCode)) &&
    unique(payload.occupations) &&
    unique(payload.services.map((service) => service.name)) &&
    payload.occupations.every((name) => name.trim()) &&
    payload.professionals.every((professional) => professional.name.trim()) &&
    payload.services.every((service) => service.name.trim()) &&
    payload.businessHours.length === 7 &&
    unique(payload.businessHours.map((day) => String(day.weekday))) &&
    payload.businessHours.every(
      (day) =>
        day.weekday >= 0 &&
        day.weekday <= 6 &&
        /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(day.start) &&
        /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(day.end) &&
        (!day.enabled || day.start < day.end),
    ) &&
    unique(payload.professionals.map((professional) => professional.name)),
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
      taxIdKind: 'cpf',
      addressLine: '',
      addressNumber: '',
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
    })),
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
    properties: { clinicId: { type: 'string', format: 'uuid' } },
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
  app.get<{ Params: { clinicId: string } }>(
    '/clinics/:clinicId/settings',
    { schema: { params } },
    async (request, reply) =>
      authorized(request, reply, 'settings:manage', async (connection, tenant) => {
        const settings = (
          await connection.query(
            'SELECT timezone, locale, currency FROM luminix.clinic_settings WHERE clinic_id = $1',
            [tenant.clinicId],
          )
        ).rows[0]
        if (!settings) throw new Error('Settings unavailable')
        return { settings }
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
          addressNote: { type: 'string', maxLength: 240 },
          taxIdKind: { type: 'string', enum: ['cpf', 'cnpj'] },
          city: { type: 'string', maxLength: 120 },
          state: { type: 'string', maxLength: 2, pattern: '^$|^[A-Z]{2}$' },
          postalCode: { type: 'string', maxLength: 9, pattern: '^$|^[0-9-]{1,9}$' },
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
            category: { type: 'string', minLength: 1, maxLength: 120 },
            name: { type: 'string', minLength: 1, maxLength: 160 },
            description: { type: 'string', maxLength: 1200 },
            priceCents: { type: 'integer', minimum: 0, maximum: 999999999 },
            durationMinutes: { type: 'integer', minimum: 1, maximum: 1440 },
            priceType: { type: 'string', enum: ['fixed', 'from', 'quote'] },
            bookingMode: { type: 'string', enum: ['instant', 'request', 'manual_release'] },
            audience: { type: 'string', enum: ['all', 'women', 'men'] },
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
          required: ['name', 'role', 'audience', 'serviceNames'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 160 },
            role: { type: 'string', minLength: 1, maxLength: 120 },
            audience: { type: 'string', enum: ['all', 'women', 'men'] },
            serviceNames: {
              type: 'array',
              maxItems: 80,
              items: { type: 'string', minLength: 1, maxLength: 160 },
            },
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
          },
        },
      },
      uiFocus: { type: 'string', enum: ['address', 'hours'] },
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
                formatVersion: Number(draft.format_version),
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
                formatVersion: 2,
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
        const row = (
          await connection.query(
            'SELECT * FROM luminix.save_onboarding_draft($1::uuid, $2::integer, $3::text, $4::jsonb)',
            [
              tenant.clinicId,
              request.body.version,
              request.body.step,
              JSON.stringify(request.body.payload),
            ],
          )
        ).rows[0]
        return {
          draft: {
            version: Number(row.draft_version),
            formatVersion: 2,
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
          'SELECT display_name FROM luminix.professionals WHERE clinic_id = $1 AND status = $2 ORDER BY display_name LIMIT 20',
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
          professionals: professionals.rows,
        }
      }),
  )
}
