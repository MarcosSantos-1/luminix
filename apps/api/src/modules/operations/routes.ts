import { appointmentRentalDates } from './rental-calendar.js'
import { appointmentPackage, packageView } from '../catalog/package-money.js'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import {
  appointmentLinkEmail,
  clientVoucherEmail,
  clientWelcomeEmail,
} from '../../shared/integrations/email/client-emails.js'
import { appointmentLinkUrl, newLinkToken } from '../client/appointment-links.js'
import { loadClinicContact, sendLater, type ClinicMail } from '../notifications/clinic-mail.js'
import type { SqlConnection } from '../../shared/database/migrations.js'
import {
  guardsWrites,
  withClinicTransaction,
  type TenantPool,
} from '../../shared/tenant/clinic-transaction.js'
import { isoDate, isPaid, rolePermissions, toNumber } from '../../shared/tenant/route-helpers.js'
import type { TenantContext } from '../../shared/tenant/tenant-context.js'
import { clientPhotoUrl, publicMediaUrl } from '../clinics/media-storage.js'
import { isValidBrazilianTaxId } from '../clinics/tax-id.js'
import { missingKeys } from '../client/routes.js'
import {
  confirmCancellationsSchema,
  dateLabel,
  fittingAppointments,
  settleScheduleImpact,
  withCancellationMail,
} from './schedule-impact.js'

type Period = { start: string; end: string }
type WarningCode =
  'past' | 'outside_availability' | 'overlap' | 'closure' | 'equipment' | 'exclusive'
// Biological sex (waxing, intimate treatments), not gender identity.
type ClientSex = 'female' | 'male'
type ClientBody = {
  name: string
  phone?: string
  email?: string
  birthDate?: string
  notes?: string
  taxId?: string
  sex?: ClientSex
  marketingOptIn?: boolean
  confirmDuplicatePhone?: boolean
}

const uuid = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
const time = '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
const ymd = '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
/** Payment taken at the visit (check-in or completion). */
const paymentBody = {
  anyOf: [
    { type: 'null' },
    {
      type: 'object',
      additionalProperties: false,
      required: ['amountCents', 'method', 'description'],
      properties: {
        amountCents: { type: 'integer', minimum: 1, maximum: 100000000 },
        method: { type: 'string', enum: ['pix', 'cash', 'credit', 'debit', 'transfer', 'other'] },
        description: { type: 'string', minLength: 1, maxLength: 160 },
      },
    },
  ],
} as const

/** "A combinar"/"a partir de": the amount the clinic set at the visit (finance:manage). */
async function agreePrice(
  connection: SqlConnection,
  clinicId: string,
  appointmentId: string,
  priceCents: number | undefined,
) {
  if (priceCents === undefined) return
  await connection.query('SELECT luminix.set_appointment_agreed_price($1, $2, $3)', [
    clinicId,
    appointmentId,
    priceCents,
  ])
}

/**
 * Records money received at the visit. A package session is booked at price 0: the money is an
 * installment of the package, linked to this visit (add_client_package_payment refuses paying
 * more than is owed). save_finance_entry checks finance:manage itself.
 */
async function recordVisitPayment(
  connection: SqlConnection,
  clinicId: string,
  appointmentId: string,
  payment: { amountCents: number; method: string; description: string } | null | undefined,
) {
  if (!payment) return
  const today = (await connection.query('SELECT luminix.clinic_today() AS d')).rows[0]?.d
  const clientPackage = (
    await connection.query(
      'SELECT client_package_id FROM luminix.appointments WHERE clinic_id = $1 AND id = $2',
      [clinicId, appointmentId],
    )
  ).rows[0]?.client_package_id as string | null | undefined
  const entry = await connection.query(
    'SELECT luminix.save_finance_entry($1::uuid, $2::jsonb) AS id',
    [
      clinicId,
      JSON.stringify({
        kind: 'income',
        amountCents: payment.amountCents,
        occurredOn: isoDate(today),
        description: payment.description,
        category: clientPackage ? 'Pacotes' : 'Atendimentos',
        method: payment.method,
        ...(clientPackage ? {} : { appointmentId }),
      }),
    ],
  )
  if (clientPackage)
    await connection.query('SELECT luminix.add_client_package_payment($1, $2, $3, $4)', [
      clinicId,
      clientPackage,
      String(entry.rows[0].id),
      appointmentId,
    ])
}

const activeAppointmentStatuses = ['scheduled', 'confirmed']

function minutes(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

function validPeriods(periods: Period[]): boolean {
  if (!Array.isArray(periods) || periods.length > 8) return false
  const normalized = periods
    .map((period) => ({
      ...period,
      startMinutes: minutes(period.start),
      endMinutes: minutes(period.end),
    }))
    .sort((left, right) => left.startMinutes - right.startMinutes)
  return normalized.every(
    (period, index) =>
      new RegExp(time).test(period.start) &&
      new RegExp(time).test(period.end) &&
      period.startMinutes < period.endMinutes &&
      (index === 0 || normalized[index - 1].endMinutes <= period.startMinutes),
  )
}

export function localDateTime(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value)
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  const date = `${read('year')}-${read('month')}-${read('day')}`
  const clock = `${read('hour')}:${read('minute')}`
  return { date, clock, weekday: new Date(`${date}T12:00:00.000Z`).getUTCDay() }
}

export function zonedLocalToUtc(value: string, timezone: string): Date {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (!match) return new Date(Number.NaN)
  const [, year, month, day, hour, minute] = match
  const target = Date.UTC(+year, +month - 1, +day, +hour, +minute)
  let candidate = new Date(target)
  for (let attempt = 0; attempt < 2; attempt++) {
    const rendered = localDateTime(candidate, timezone)
    const renderedUtc = Date.parse(`${rendered.date}T${rendered.clock}:00.000Z`)
    candidate = new Date(candidate.getTime() + target - renderedUtc)
  }
  const final = localDateTime(candidate, timezone)
  return final.date === `${year}-${month}-${day}` && final.clock === `${hour}:${minute}`
    ? candidate
    : new Date(Number.NaN)
}

function fitsPeriod(start: Date, end: Date, timezone: string, periods: Period[]) {
  const localStart = localDateTime(start, timezone)
  const localEnd = localDateTime(end, timezone)
  if (localStart.date !== localEnd.date) return false
  return periods.some((period) => period.start <= localStart.clock && period.end >= localEnd.clock)
}

type BookingWarning = { conflictIds?: string[]; code: WarningCode; title: string; detail: string }

type ClosureKind =
  | 'vacation'
  | 'collective_vacation'
  | 'bereavement'
  | 'maintenance'
  | 'renovation'
  | 'sick_leave'
  | 'training'
  | 'event'
  | 'other'
/** Mirrors luminix.closure_permission: people away need vacation:manage. */
const vacationKinds = new Set(['vacation', 'collective_vacation', 'sick_leave', 'bereavement'])
export const closurePermission = (kind: string) =>
  vacationKinds.has(kind) ? 'vacation:manage' : 'schedule:manage'

const closureLabel: Record<string, string> = {
  vacation: 'Férias',
  collective_vacation: 'Férias coletivas',
  bereavement: 'Luto',
  maintenance: 'Manutenção',
  renovation: 'Reforma',
  sick_leave: 'Licença / atestado',
  training: 'Curso ou treinamento',
  event: 'Evento',
  other: 'Período sem atendimento',
}

/** What the manager must confirm before a time is accepted (clients are simply refused). */
async function bookingWarnings(
  connection: SqlConnection,
  clinicId: string,
  slot: {
    startsAt: Date
    endsAt: Date
    timezone: string
    professionalId: string | null
    serviceId: string
  },
  ignoreAppointmentId: string | null,
): Promise<BookingWarning[]> {
  const local = localDateTime(slot.startsAt, slot.timezone)
  const previousDate = new Date(Date.parse(`${local.date}T00:00:00Z`) - 86400000)
    .toISOString()
    .slice(0, 10)
  const hours = await connection.query(
    `SELECT dates.day::text, coalesce(o.is_available, w.is_available, false) AS is_available,
            coalesce(o.periods, w.periods, '[]'::jsonb) AS periods,
            NOT luminix.rental_fits($1,$4,NULL,$5::timestamptz AT TIME ZONE $7,$6::timestamptz AT TIME ZONE $7) AS missing_equipment
       FROM (VALUES ($2::date), ($3::date)) AS dates(day)
       LEFT JOIN luminix.schedule_overrides o ON o.clinic_id = $1 AND o.local_date = dates.day
       LEFT JOIN luminix.weekly_availability w ON w.clinic_id = $1 AND w.weekday = extract(dow FROM dates.day)`,
    [
      clinicId,
      local.date,
      previousDate,
      slot.serviceId,
      slot.startsAt.toISOString(),
      slot.endsAt.toISOString(),
      slot.timezone,
    ],
  )
  if (hours.rows[0]?.missing_equipment)
    throw Object.assign(new Error('Equipment unavailable'), { code: '55000' })
  const availability = hours.rows.find((row) => row.day === local.date)
  const previous = hours.rows.find((row) => row.day === previousDate)
  const periods = (availability?.periods ?? []) as Period[]
  if (availability?.is_available && periods.length) {
    const start = minutes(local.clock)
    const endLocal = localDateTime(slot.endsAt, slot.timezone)
    const days = (Date.parse(endLocal.date) - Date.parse(local.date)) / 86400000
    const end = days * 1440 + minutes(endLocal.clock)
    const first = Math.max(0, Math.min(...periods.map((period) => minutes(period.start))) - 120)
    const last = Math.max(...periods.map((period) => minutes(period.end))) + 240
    const previousPeriods = (previous?.periods ?? []) as Period[]
    const lateFromPrevious =
      previous?.is_available &&
      previousPeriods.some((period) => end <= minutes(period.end) + 240 - 1440)
    if ((start < first || end > last) && !lateFromPrevious)
      throw Object.assign(new Error('Outside manager booking window'), { code: '55000' })
  }
  const overlap = await connection.query(
    `SELECT a.id, c.display_name, s.name, a.starts_at, a.ends_at FROM luminix.appointments a
       JOIN luminix.clinic_clients c ON c.clinic_id = a.clinic_id AND c.id = a.clinic_client_id
       JOIN luminix.services s ON s.clinic_id = a.clinic_id AND s.id = a.service_id
      WHERE a.clinic_id = $1 AND a.status = ANY($2::text[])
        AND starts_at < $4 AND ends_at > $3
        AND ($5::uuid IS NULL OR a.professional_id IS NULL OR a.professional_id = $5::uuid)
        AND ($6::uuid IS NULL OR a.id <> $6::uuid)
      ORDER BY a.starts_at, a.id`,
    [
      clinicId,
      activeAppointmentStatuses,
      slot.startsAt.toISOString(),
      slot.endsAt.toISOString(),
      slot.professionalId,
      ignoreAppointmentId,
    ],
  )
  const closures = await connection.query(
    `SELECT c.kind, c.professional_id, p.display_name
       FROM luminix.schedule_closures c
       LEFT JOIN luminix.professionals p ON p.clinic_id = c.clinic_id AND p.id = c.professional_id
      WHERE c.clinic_id = $1 AND $2::date BETWEEN c.starts_on AND c.ends_on
        AND (c.professional_id IS NULL OR c.professional_id = $3::uuid)
      ORDER BY c.professional_id NULLS FIRST LIMIT 1`,
    [clinicId, local.date, slot.professionalId],
  )
  // Dia exclusivo de locação (ADR-035): clients cannot book other treatments; the manager can.
  const exclusive = await connection.query(
    `SELECT r.name FROM luminix.resource_rentals rr
       JOIN luminix.resources r ON r.clinic_id = rr.clinic_id AND r.id = rr.resource_id
      WHERE rr.clinic_id = $1 AND rr.available AND rr.exclusive AND r.status = 'active'
        AND $2::date BETWEEN rr.starts_on AND rr.ends_on
        AND luminix.exclusive_rental_blocks($1, $3, $2::date)
      ORDER BY r.name LIMIT 3`,
    [clinicId, local.date, slot.serviceId],
  )
  const warnings: BookingWarning[] = []
  if (exclusive.rows.length)
    warnings.push({
      code: 'exclusive',
      title: 'Dia reservado à locação',
      detail: `Este dia está reservado aos tratamentos com ${exclusive.rows.map((row) => String(row.name)).join(', ')}. Clientes não conseguem marcar outros tratamentos.`,
    })
  const closure = closures.rows[0]
  if (closure)
    warnings.push({
      code: 'closure',
      title: closure.professional_id
        ? `${String(closure.display_name ?? 'A profissional')} está ausente`
        : 'Espaço fechado neste período',
      detail: `${closureLabel[String(closure.kind)] ?? 'Período sem atendimento'}. Clientes não conseguem agendar neste dia.`,
    })
  if (slot.startsAt.getTime() < Date.now())
    warnings.push({
      code: 'past',
      title: 'Horário no passado',
      detail: 'O atendimento ficará registrado em um horário que já passou.',
    })
  if (
    !availability?.is_available ||
    !fitsPeriod(slot.startsAt, slot.endsAt, slot.timezone, periods)
  )
    warnings.push({
      code: 'outside_availability',
      title: 'Fora do horário disponível',
      detail: 'Clientes não poderiam escolher este horário, mas o gestor pode prosseguir.',
    })
  if (overlap.rows.length)
    warnings.push({
      conflictIds: overlap.rows.map((row) => String(row.id)),
      code: 'overlap',
      title: 'Conflito de agenda',
      detail: `${overlap.rows.map((row) => `${row.name} · ${row.display_name} (${localDateTime(new Date(String(row.starts_at)), slot.timezone).clock}–${localDateTime(new Date(String(row.ends_at)), slot.timezone).clock})`).join(' / ')}`,
    })
  return warnings
}

const localStartPattern = '^\\d{4}-\\d{2}-\\d{2}T(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
const confirmedWarningsSchema = {
  type: 'array',
  uniqueItems: true,
  items: {
    type: 'string',
    enum: ['past', 'outside_availability', 'overlap', 'closure', 'equipment', 'exclusive'],
  },
} as const

const clientBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 160, pattern: '\\S' },
    phone: { type: 'string', maxLength: 16, pattern: '^$|^\\+[1-9][0-9]{7,14}$' },
    email: { type: 'string', maxLength: 254 },
    birthDate: { type: 'string', pattern: `^$|${ymd.slice(1, -1)}$` },
    notes: { type: 'string', maxLength: 4000 },
    taxId: { type: 'string', maxLength: 14 },
    sex: { type: 'string', enum: ['female', 'male'] },
    marketingOptIn: { type: 'boolean' },
    confirmDuplicatePhone: { type: 'boolean' },
  },
} as const

// Full detail, including the whole CPF. Only served to staff who can manage clients.
const clientDetailColumns = `id, display_name, contact_phone, contact_email, birth_date, notes,
  status, created_at, tax_id, sex, source, marketing_opt_in, marketing_opt_in_at,
  client_profile_id IS NOT NULL AS linked`

/** The 512px copy of a client photo, from the key of its 128px copy. */
const largeKey = (key: unknown) =>
  key ? String(key).replace(/small-128\.webp$/, 'large-512.webp') : null

function normalizeClient(body: ClientBody) {
  const email = body.email?.trim().toLowerCase() || null
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Invalid email' }
  const taxId = body.taxId?.replace(/\D/g, '') || null
  if (taxId && !isValidBrazilianTaxId('cpf', taxId)) return { error: 'Invalid tax id' }
  const birthDate = body.birthDate || null
  // One day of slack so a clinic ahead of UTC can still register someone born "today".
  if (birthDate && birthDate > new Date(Date.now() + 86400000).toISOString().slice(0, 10))
    return { error: 'Invalid birth date' }
  return {
    values: {
      name: body.name.trim(),
      phone: body.phone?.trim() || null,
      email,
      birthDate,
      notes: body.notes?.trim() || null,
      taxId,
      sex: body.sex ?? null,
      marketingOptIn: body.marketingOptIn ?? false,
    },
  }
}

const periodSchema = {
  type: 'array',
  maxItems: 8,
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['start', 'end'],
    properties: {
      start: { type: 'string', pattern: time },
      end: { type: 'string', pattern: time },
    },
  },
} as const

export async function operationRoutes(
  app: FastifyInstance,
  authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<string | null>,
  pool: TenantPool | undefined,
  mail?: ClinicMail,
) {
  const clinicParams = {
    type: 'object',
    additionalProperties: false,
    required: ['clinicId'],
    properties: {
      clinicId: {
        type: 'string',
        pattern: `^(?:${uuid.slice(1, -1)}|[A-Za-z]{2}-[0-9]{4})$`,
      },
    },
  } as const

  async function authorized(
    request: FastifyRequest<{ Params: { clinicId: string } }>,
    reply: FastifyReply,
    permission: string,
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
        { guardWrites: guardsWrites(request) },
      )
    } catch (error) {
      const code = (error as { code?: string }).code
      if ((error as { statusCode?: number }).statusCode === 402)
        return reply.code(402).send({ error: 'Subscription required' })
      const responseBody = (error as { responseBody?: unknown }).responseBody
      if ((error as { statusCode?: number }).statusCode === 409 && responseBody)
        return reply.code(409).send(responseBody)
      if ((error as { statusCode?: number }).statusCode === 403)
        return reply.code(403).send({ error: 'Clinic access denied' })
      if (code === '23503') return reply.code(400).send({ error: 'Invalid clinic resource' })
      if (code === '23505') return reply.code(409).send({ error: 'Record already exists' })
      if (code === 'P0002') return reply.code(404).send({ error: 'Not found' })
      if (code === '55000')
        return reply.code(409).send({ error: (error as Error).message || 'Not allowed now' })
      if (code === '22023' || code === '23514')
        return reply.code(400).send({ error: 'Invalid data' })
      request.log.warn({ event: 'clinic_operation_unavailable' })
      return reply.code(503).send({ error: 'Clinic unavailable' })
    }
  }

  app.get<{
    Params: { clinicId: string }
    Querystring: { q?: string; status?: 'active' | 'archived' | 'all' }
  }>(
    '/clinics/:clinicId/clients',
    {
      schema: {
        params: clinicParams,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            q: { type: 'string', maxLength: 120 },
            status: { type: 'string', enum: ['active', 'archived', 'all'] },
          },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'client:read', async (connection, tenant) => {
        const query = request.query.q?.trim() ?? ''
        const status = request.query.status ?? 'active'
        const result = await connection.query(
          `SELECT c.id, c.display_name, c.contact_phone, c.contact_email, c.birth_date,
                  c.notes, c.status, c.created_at, c.sex, c.source, c.marketing_opt_in,
                  c.client_profile_id IS NOT NULL AS linked,
                  (SELECT m.small_object_key FROM luminix.media_assets m
                   WHERE m.clinic_id = c.clinic_id AND m.id = c.photo_asset_id
                     AND m.status = 'ready') AS photo_key,
                      luminix.clinic_client_has_account_photo(c.clinic_id, c.id) AS account_photo,
                  luminix.clinic_client_anamnesis_summary(c.clinic_id, c.id) AS anamnesis,
                  CASE WHEN c.tax_id IS NULL THEN NULL
                       ELSE '***.***.***-' || right(c.tax_id, 2) END AS tax_id_masked,
                  count(a.id)::integer AS appointment_count,
                  count(a.id) FILTER (WHERE a.status = 'completed')::integer AS completed_count,
                  coalesce(sum(a.price_cents) FILTER (WHERE a.status = 'completed'), 0)::integer AS spent_cents,
                  max(a.starts_at) FILTER (WHERE a.status IN ('confirmed','completed')
                    AND a.starts_at <= now()) AS last_visit_at,
                  min(a.starts_at) FILTER (WHERE a.status IN ('scheduled','confirmed')
                    AND a.starts_at > now()) AS next_visit_at
             FROM luminix.clinic_clients c
             LEFT JOIN luminix.appointments a
               ON a.clinic_id = c.clinic_id AND a.clinic_client_id = c.id
            WHERE c.clinic_id = $1
              AND ($2 = 'all' OR c.status = $2)
              AND ($3 = '' OR c.display_name ILIKE '%' || $3 || '%'
                OR coalesce(c.contact_phone, '') ILIKE '%' || $3 || '%'
                OR coalesce(c.contact_email, '') ILIKE '%' || $3 || '%'
                OR ($4 <> '' AND coalesce(c.tax_id, '') LIKE '%' || $4 || '%'))
            GROUP BY c.id
            ORDER BY lower(c.display_name), c.id
            LIMIT 200`,
          [
            tenant.clinicId,
            status,
            query,
            query.replace(/\D/g, '').length >= 3 ? query.replace(/\D/g, '') : '',
          ],
        )
        // Money follows the Financeiro permission, like the agenda prices.
        const canSeeMoney = (await rolePermissions(connection, tenant)).has('finance:manage')
        const level = await connection.query('SELECT luminix.clinic_anamnesis_level($1) AS level', [
          tenant.clinicId,
        ])
        return {
          canSeeMoney,
          canIssueVouchers: canSeeMoney,
          anamnesisLevel: Number(level.rows[0]?.level ?? 1),
          clients: await Promise.all(
            result.rows.map(async ({ photo_key, ...row }) => ({
              ...row,
              spent_cents: canSeeMoney ? row.spent_cents : null,
              photo_url: await clientPhotoUrl(photo_key),
              photo_large_url: await clientPhotoUrl(largeKey(photo_key)),
              account_photo: !photo_key && row.account_photo === true,
            })),
          ),
        }
      }),
  )

  // A shared phone is legitimate (mother/daughter, couple), so a duplicate only asks for
  // confirmation. A repeated CPF is never legitimate inside one clinic and is refused.
  async function conflicts(
    connection: SqlConnection,
    clinicId: string,
    values: { phone: string | null; taxId: string | null },
    excludeId: string | null,
  ) {
    if (values.taxId) {
      const owner = (
        await connection.query(
          `SELECT id, display_name FROM luminix.clinic_clients
            WHERE clinic_id = $1 AND tax_id = $2 AND ($3::uuid IS NULL OR id <> $3::uuid)`,
          [clinicId, values.taxId, excludeId],
        )
      ).rows[0]
      if (owner) return { taxIdOwner: owner, duplicates: [] }
    }
    const duplicates = values.phone
      ? (
          await connection.query(
            `SELECT id, display_name, status FROM luminix.clinic_clients
              WHERE clinic_id = $1 AND contact_phone = $2 AND ($3::uuid IS NULL OR id <> $3::uuid)
              ORDER BY lower(display_name) LIMIT 5`,
            [clinicId, values.phone, excludeId],
          )
        ).rows
      : []
    return { taxIdOwner: null, duplicates }
  }

  app.post<{ Params: { clinicId: string }; Body: ClientBody }>(
    '/clinics/:clinicId/clients',
    { bodyLimit: 8192, schema: { params: clinicParams, body: clientBodySchema } },
    async (request, reply) => {
      const result = await authorized(
        request,
        reply,
        'client:manage',
        async (connection, tenant) => {
          const parsed = normalizeClient(request.body)
          if ('error' in parsed) return reply.code(400).send({ error: parsed.error })
          const v = parsed.values
          const found = await conflicts(connection, tenant.clinicId, v, null)
          if (found.taxIdOwner)
            return reply
              .code(409)
              .send({ error: 'Tax id already registered', client: found.taxIdOwner })
          if (found.duplicates.length && !request.body.confirmDuplicatePhone)
            return reply
              .code(409)
              .send({ error: 'Client requires confirmation', duplicates: found.duplicates })
          const result = await connection.query(
            `SELECT ${clientDetailColumns}
             FROM luminix.create_clinic_client_v2($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              tenant.clinicId,
              v.name,
              v.phone,
              v.email,
              v.birthDate,
              v.notes,
              v.taxId,
              v.sex,
              v.marketingOptIn,
            ],
          )
          reply.code(201)
          return {
            client: result.rows[0],
            // Welcome e-mail after commit, only when the client has an e-mail.
            welcome: v.email ? await loadClinicContact(connection, tenant.clinicId) : null,
            email: v.email,
          }
        },
      )
      if (reply.sent || !result || typeof result !== 'object') return result
      const { welcome, email, ...body } = result as {
        welcome: Awaited<ReturnType<typeof loadClinicContact>> | null
        email: string | null
        client: { display_name?: string; name?: string }
      }
      if (welcome && email && welcome.clinicName)
        sendLater(
          mail,
          clientWelcomeEmail({
            to: email,
            clientName: String(body.client.display_name ?? body.client.name ?? ''),
            ...welcome,
          }),
          request.log,
        )
      return body
    },
  )

  const clientParams = {
    type: 'object',
    additionalProperties: false,
    required: ['clinicId', 'clientId'],
    properties: { ...clinicParams.properties, clientId: { type: 'string', pattern: uuid } },
  } as const

  app.get<{ Params: { clinicId: string; clientId: string } }>(
    '/clinics/:clinicId/clients/:clientId/vouchers',
    { schema: { params: clientParams } },
    async (request, reply) =>
      authorized(request, reply, 'agenda:manage', async (connection, tenant) => {
        const { rows } = await connection.query(
          `SELECT v.id, v.discount_type, v.discount_value, v.expires_on::text, v.appointment_id,
                  v.service_id, (SELECT name FROM luminix.services sv
                    WHERE sv.clinic_id = v.clinic_id AND sv.id = v.service_id) AS service_name,
                  CASE WHEN v.appointment_id IS NOT NULL THEN 'used'
                    WHEN v.expires_on < (now() AT TIME ZONE s.timezone)::date THEN 'expired'
                    ELSE 'available' END AS status
             FROM luminix.client_vouchers v
             JOIN luminix.clinic_settings s ON s.clinic_id = v.clinic_id
            WHERE v.clinic_id = $1 AND v.clinic_client_id = $2
            ORDER BY v.created_at DESC LIMIT 100`,
          [tenant.clinicId, request.params.clientId],
        )
        return { vouchers: rows }
      }),
  )

  app.post<{
    Params: { clinicId: string; clientId: string }
    Body: {
      id: string
      type: 'fixed' | 'percent' | 'service'
      value: number
      expiresOn: string
      serviceId?: string
    }
  }>(
    '/clinics/:clinicId/clients/:clientId/vouchers',
    {
      schema: {
        params: clientParams,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'type', 'value', 'expiresOn'],
          properties: {
            id: { type: 'string', pattern: uuid },
            type: { type: 'string', enum: ['fixed', 'percent', 'service'] },
            value: { type: 'integer', minimum: 1, maximum: 100000000 },
            expiresOn: { type: 'string', format: 'date' },
            // "Serviço grátis": the service it pays for.
            serviceId: { type: 'string', pattern: uuid },
          },
        },
      },
    },
    async (request, reply) => {
      const result = await authorized(
        request,
        reply,
        'finance:manage',
        async (connection, tenant) => {
          const { id, type, value, expiresOn, serviceId } = request.body
          if (type === 'service' && !serviceId)
            return reply.code(400).send({ error: 'Service required' })
          const issued =
            (type === 'service'
              ? await connection.query(
                  'SELECT luminix.issue_service_voucher($1, $2, $3, $4, $5) AS created',
                  [tenant.clinicId, request.params.clientId, id, serviceId, expiresOn],
                )
              : await connection.query(
                  'SELECT luminix.issue_client_voucher($1, $2, $3, $4, $5, $6) AS created',
                  [tenant.clinicId, request.params.clientId, id, type, value, expiresOn],
                )
            ).rows[0]?.created === true
          const serviceName =
            type === 'service'
              ? String(
                  (
                    await connection.query(
                      'SELECT name FROM luminix.services WHERE clinic_id = $1 AND id = $2',
                      [tenant.clinicId, serviceId],
                    )
                  ).rows[0]?.name ?? 'Serviço',
                )
              : null
          const client = (
            await connection.query(
              `SELECT contact_email, display_name, marketing_opt_in, client_profile_id IS NOT NULL AND client_removed_at IS NULL AS linked
             FROM luminix.clinic_clients WHERE clinic_id = $1 AND id = $2`,
              [tenant.clinicId, request.params.clientId],
            )
          ).rows[0]
          const destination = client.linked
            ? 'app'
            : client.contact_email && client.marketing_opt_in && mail?.mailer
              ? 'email'
              : 'manual'
          const email =
            issued && destination === 'email'
              ? clientVoucherEmail({
                  ...(await loadClinicContact(connection, tenant.clinicId)),
                  to: String(client.contact_email),
                  clientName: String(client.display_name),
                  type,
                  value,
                  expiresOn,
                  serviceName,
                })
              : null
          return { id, destination, email }
        },
      )
      if (reply.sent || !result || typeof result !== 'object' || !('email' in result)) return result
      const { email, ...body } = result as {
        email: ReturnType<typeof clientVoucherEmail> | null
        id: string
        destination: string
      }
      sendLater(mail, email, request.log)
      return reply.code(201).send(body)
    },
  )

  // Detail for editing: whole CPF and recent history, so it needs client:manage.
  app.get<{ Params: { clinicId: string; clientId: string } }>(
    '/clinics/:clinicId/clients/:clientId',
    { schema: { params: clientParams } },
    async (request, reply) =>
      authorized(request, reply, 'client:manage', async (connection, tenant) => {
        const client = (
          await connection.query(
            `SELECT ${clientDetailColumns} FROM luminix.clinic_clients
              WHERE clinic_id = $1 AND id = $2`,
            [tenant.clinicId, request.params.clientId],
          )
        ).rows[0]
        if (!client) return reply.code(404).send({ error: 'Client not found' })
        const history = await connection.query(
          `SELECT a.id, a.starts_at, a.status, s.name AS service_name, s.price_type,
                  a.price_cents, p.display_name AS professional_name, a.booking_source,
                  a.status_note, a.client_payment_method, a.previous_starts_at, a.rescheduled_at,
                  cp.name AS package_name,
                  CASE WHEN cp.kind = 'combo' THEN cp.sessions_total ELSE coalesce(pi.sessions, cp.sessions_total) END AS package_sessions,
                  (SELECT count(*)::integer FROM luminix.appointments v
                    WHERE v.clinic_id = a.clinic_id AND v.client_package_id = a.client_package_id
                      AND (cp.kind = 'combo' OR v.service_id = a.service_id)
                      AND v.status IN ('scheduled', 'confirmed', 'completed', 'no_show')
                      AND (v.starts_at, v.id) <= (a.starts_at, a.id)) AS package_session,
                  luminix.appointment_paid_cents(a.clinic_id, a.id) AS paid_cents,
                  (SELECT e.method FROM luminix.finance_entries e
                    WHERE e.clinic_id = a.clinic_id AND e.appointment_id = a.id
                      AND e.status = 'active' AND e.kind = 'income'
                    ORDER BY e.created_at DESC LIMIT 1) AS paid_method
             FROM luminix.appointments a
             JOIN luminix.services s ON s.clinic_id = a.clinic_id AND s.id = a.service_id
             LEFT JOIN luminix.professionals p
               ON p.clinic_id = a.clinic_id AND p.id = a.professional_id
             LEFT JOIN luminix.client_packages cp ON cp.clinic_id = a.clinic_id AND cp.id = a.client_package_id
             LEFT JOIN luminix.client_package_items pi ON pi.clinic_id = cp.clinic_id AND pi.client_package_id = cp.id AND pi.service_id = a.service_id
            WHERE a.clinic_id = $1 AND a.clinic_client_id = $2
            ORDER BY a.starts_at DESC LIMIT 50`,
          [tenant.clinicId, request.params.clientId],
        )
        const canSeeMoney = (await rolePermissions(connection, tenant)).has('finance:manage')
        const anamnesis = (
          await connection.query(
            `SELECT luminix.staff_client_anamnesis($1, $2) AS record,
                    luminix.clinic_anamnesis_level($1) AS required_level,
                    (SELECT anamnesis_shared FROM luminix.clinic_clients
                      WHERE clinic_id = $1 AND id = $2) AS shared`,
            [tenant.clinicId, request.params.clientId],
          )
        ).rows[0]
        return {
          client,
          canSeeMoney,
          anamnesis: {
            record: anamnesis?.record ?? null,
            requiredLevel: Number(anamnesis?.required_level ?? 1),
            shared: anamnesis?.shared === true,
          },
          // Payment state per appointment; amounts only for who sees money. A receipt link
          // (in-app payments) joins here once Stripe charges are reconciled (TD-008).
          history: history.rows.map(({ paid_cents, ...row }) => ({
            ...row,
            paid: isPaid({ paid_cents, price_cents: row.price_cents }),
            paid_cents: canSeeMoney ? toNumber(paid_cents) : null,
            price_cents: canSeeMoney ? row.price_cents : null,
            paid_method: canSeeMoney ? row.paid_method : null,
            receipt_url: null,
          })),
        }
      }),
  )

  // Anamnese filled by the team (ADR-032): same script as the client area, without the photo
  // (the client's photo lives in the record's media). Never overwrites a shared account record.
  app.put<{
    Params: { clinicId: string; clientId: string }
    Body: {
      level: 1 | 2 | 3
      answers: Record<string, string | boolean | number | string[]>
      consent: true
    }
  }>(
    '/clinics/:clinicId/clients/:clientId/anamnesis',
    {
      bodyLimit: 32_768,
      schema: {
        params: clientParams,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['level', 'answers', 'consent'],
          properties: {
            level: { type: 'integer', enum: [1, 2, 3] },
            answers: {
              type: 'object',
              maxProperties: 80,
              propertyNames: { pattern: '^[a-zA-Z]{1,40}$' },
              additionalProperties: {
                anyOf: [
                  { type: 'string', maxLength: 500 },
                  { type: 'boolean' },
                  { type: 'integer', minimum: 0, maximum: 100 },
                  { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 40 } },
                ],
              },
            },
            consent: { type: 'boolean', const: true },
          },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'client:manage', async (connection, tenant) => {
        const { level, answers } = request.body
        const birth = typeof answers.birthDate === 'string' ? answers.birthDate : ''
        if (
          !['female', 'male'].includes(String(answers.sex)) ||
          !/^\d{4}-\d{2}-\d{2}$/.test(birth) ||
          Date.parse(`${birth}T12:00:00Z`) >= Date.now() ||
          missingKeys(level, answers).length
        )
          return reply.code(400).send({ error: 'Incomplete anamnesis' })
        const record = { version: 2, level, answeredAt: new Date().toISOString(), answers }
        await connection.query('SELECT luminix.staff_save_client_anamnesis($1, $2, $3::jsonb)', [
          tenant.clinicId,
          request.params.clientId,
          JSON.stringify(record),
        ])
        return { anamnesis: { level, answeredAt: record.answeredAt, by: 'staff' } }
      }),
  )

  // Replaces every editable field (the form always sends the whole record).
  app.put<{ Params: { clinicId: string; clientId: string }; Body: ClientBody }>(
    '/clinics/:clinicId/clients/:clientId',
    { bodyLimit: 8192, schema: { params: clientParams, body: clientBodySchema } },
    async (request, reply) =>
      authorized(request, reply, 'client:manage', async (connection, tenant) => {
        const parsed = normalizeClient(request.body)
        if ('error' in parsed) return reply.code(400).send({ error: parsed.error })
        const v = parsed.values
        const found = await conflicts(connection, tenant.clinicId, v, request.params.clientId)
        if (found.taxIdOwner)
          return reply
            .code(409)
            .send({ error: 'Tax id already registered', client: found.taxIdOwner })
        if (found.duplicates.length && !request.body.confirmDuplicatePhone)
          return reply
            .code(409)
            .send({ error: 'Client requires confirmation', duplicates: found.duplicates })
        const result = await connection.query(
          `SELECT ${clientDetailColumns}
             FROM luminix.update_clinic_client($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            tenant.clinicId,
            request.params.clientId,
            v.name,
            v.phone,
            v.email,
            v.birthDate,
            v.notes,
            v.taxId,
            v.sex,
            v.marketingOptIn,
          ],
        )
        if (!result.rows[0]) return reply.code(404).send({ error: 'Client not found' })
        return { client: result.rows[0] }
      }),
  )

  app.put<{
    Params: { clinicId: string; clientId: string }
    Body: { status: 'active' | 'archived' }
  }>(
    '/clinics/:clinicId/clients/:clientId/status',
    {
      schema: {
        params: clientParams,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['status'],
          properties: { status: { type: 'string', enum: ['active', 'archived'] } },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'client:manage', async (connection, tenant) => {
        const result = await connection.query(
          'SELECT id FROM luminix.set_clinic_client_status($1, $2, $3)',
          [tenant.clinicId, request.params.clientId, request.body.status],
        )
        if (!result.rows[0]) return reply.code(404).send({ error: 'Client not found' })
        return { status: request.body.status }
      }),
  )

  // Photo the client sent through the client area (a small JPEG kept with the account record).
  // Loaded one by one, on demand, so lists never carry the image bytes.
  app.get<{ Params: { clinicId: string; clientId: string } }>(
    '/clinics/:clinicId/clients/:clientId/photo',
    { schema: { params: clientParams } },
    async (request, reply) =>
      authorized(request, reply, 'client:read', async (connection, tenant) => {
        const row = (
          await connection.query(
            'SELECT luminix.clinic_client_account_photo($1::uuid, $2::uuid) AS photo',
            [tenant.clinicId, request.params.clientId],
          )
        ).rows[0]
        return { photo: row?.photo ? String(row.photo) : null }
      }),
  )

  // The photo is sent through the media upload (kind client_photo); this only removes it.
  app.put<{ Params: { clinicId: string; clientId: string }; Body: { remove: true } }>(
    '/clinics/:clinicId/clients/:clientId/photo',
    {
      schema: {
        params: clientParams,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['remove'],
          properties: { remove: { type: 'boolean', const: true } },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'client:manage', async (connection, tenant) => {
        await connection.query('SELECT luminix.remove_client_photo($1::uuid, $2::uuid)', [
          tenant.clinicId,
          request.params.clientId,
        ])
        return { removed: true }
      }),
  )

  app.get<{
    Params: { clinicId: string }
    Querystring: { from: string; to: string }
  }>(
    '/clinics/:clinicId/agenda',
    {
      schema: {
        params: clinicParams,
        querystring: {
          type: 'object',
          additionalProperties: false,
          required: ['from', 'to'],
          properties: {
            from: { type: 'string', format: 'date-time' },
            to: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'agenda:read', async (connection, tenant) => {
        const from = new Date(request.query.from)
        const to = new Date(request.query.to)
        if (!(to > from) || to.getTime() - from.getTime() > 63 * 86400000)
          return reply.code(400).send({ error: 'Invalid date range' })
        const can = await rolePermissions(connection, tenant)
        // Unpaid deposit holds past their time free the slot before the agenda is read.
        await connection.query('SELECT luminix.expire_deposit_holds($1)', [tenant.clinicId])
        const [
          appointments,
          clients,
          services,
          professionals,
          weekly,
          overrides,
          settings,
          professionalDays,
          closures,
          location,
          professionalOverrides,
          exclusiveRentals,
        ] = await Promise.all([
          connection.query(
            `SELECT a.id, a.starts_at, a.ends_at, a.status, a.booking_source, a.checked_in_at,
                      a.status_note, a.deposit_cents, a.deposit_status, a.deposit_due_at, a.deposit_reported_at,
                      a.override_reasons, a.notes, a.previous_starts_at, a.price_cents,
                      a.price_agreed_at,
                      c.id AS client_id, c.display_name AS client_name,
                      c.contact_phone AS client_phone, c.notes AS client_notes,
                      (SELECT m.small_object_key FROM luminix.media_assets m
                       WHERE m.clinic_id = c.clinic_id AND m.id = c.photo_asset_id
                         AND m.status = 'ready') AS photo_key,
                      luminix.clinic_client_has_account_photo(c.clinic_id, c.id) AS account_photo,
                      s.id AS service_id, s.name AS service_name, s.price_type,
                      ${appointmentRentalDates} AS rental_dates,
                      s.duration_minutes, p.id AS professional_id, p.display_name AS professional_name,
                      luminix.appointment_paid_cents(a.clinic_id, a.id) AS paid_cents,
                      (SELECT cp.name FROM luminix.client_packages cp
                        WHERE cp.clinic_id = a.clinic_id AND cp.id = a.client_package_id
                          AND cp.kind = 'combo') AS combo_name,
                      ${appointmentPackage} AS package,
                      link.answer AS link_answer, link.answered_at AS link_answered_at,
                      link.opened_at AS link_opened_at
                 FROM luminix.appointments a
                 JOIN luminix.clinic_clients c ON c.clinic_id = a.clinic_id AND c.id = a.clinic_client_id
                 JOIN luminix.services s ON s.clinic_id = a.clinic_id AND s.id = a.service_id
                 LEFT JOIN luminix.professionals p ON p.clinic_id = a.clinic_id AND p.id = a.professional_id
                 LEFT JOIN luminix.appointment_links link
                   ON link.clinic_id = a.clinic_id AND link.appointment_id = a.id
                WHERE a.clinic_id = $1
                  AND ((a.starts_at < $3 AND a.ends_at > $2)
                    OR (a.previous_starts_at >= $2 AND a.previous_starts_at < $3))
                ORDER BY a.starts_at, a.id`,
            [tenant.clinicId, from.toISOString(), to.toISOString()],
          ),
          connection.query(
            `SELECT c.id, c.display_name,
                      CASE WHEN $2::boolean THEN c.contact_phone END AS contact_phone,
                      m.small_object_key AS photo_key,
                      CASE WHEN $2::boolean THEN luminix.clinic_client_has_account_photo(c.clinic_id, c.id)
                        ELSE false END AS account_photo
                 FROM luminix.clinic_clients c
                 LEFT JOIN luminix.media_assets m ON $2::boolean AND m.clinic_id = c.clinic_id
                   AND m.id = c.photo_asset_id AND m.status = 'ready'
                WHERE c.clinic_id = $1 AND c.status = 'active' ORDER BY lower(c.display_name) LIMIT 500`,
            [tenant.clinicId, can.has('client:read')],
          ),
          connection.query(
            `SELECT id, name, duration_minutes, price_cents, price_type, luminix.service_rental_days(clinic_id, id, luminix.clinic_today(), 'infinity') AS rental_dates,
              (SELECT jsonb_object_agg(day::text,luminix.minute_pairs(spans)) FROM
                luminix.service_rental_calendar(s.clinic_id,s.id,$2::date,$3::date)) AS rental_hours
              FROM luminix.services s
                WHERE clinic_id = $1 AND status = 'active' ORDER BY lower(name) LIMIT 200`,
            [tenant.clinicId, request.query.from.slice(0, 10), request.query.to.slice(0, 10)],
          ),
          connection.query(
            `SELECT p.id, p.display_name, p.gender, photo.small_object_key AS photo_key
                 FROM luminix.professionals p
                 LEFT JOIN luminix.media_assets photo ON photo.clinic_id = p.clinic_id
                   AND photo.id = p.photo_asset_id AND photo.status = 'ready'
                WHERE p.clinic_id = $1 AND p.status = 'active'
                ORDER BY lower(p.display_name) LIMIT 100`,
            [tenant.clinicId],
          ),
          connection.query(
            `SELECT weekday, is_available, periods FROM luminix.weekly_availability
                WHERE clinic_id = $1 ORDER BY weekday`,
            [tenant.clinicId],
          ),
          connection.query(
            `SELECT local_date, is_available, periods, reason FROM luminix.schedule_overrides
                WHERE clinic_id = $1 AND local_date BETWEEN $2::date AND $3::date ORDER BY local_date`,
            [tenant.clinicId, request.query.from.slice(0, 10), request.query.to.slice(0, 10)],
          ),
          connection.query('SELECT timezone FROM luminix.clinic_settings WHERE clinic_id = $1', [
            tenant.clinicId,
          ]),
          connection.query(
            `SELECT w.professional_id, w.weekday, w.is_available, w.periods
                 FROM luminix.professional_weekly_availability w
                 JOIN luminix.professionals p ON p.clinic_id = w.clinic_id AND p.id = w.professional_id
                WHERE w.clinic_id = $1 AND p.status = 'active'
                ORDER BY w.professional_id, w.weekday`,
            [tenant.clinicId],
          ),
          // Closures reach back a year so a long vacation that started earlier still shows.
          connection.query(
            `SELECT id, professional_id, starts_on::text AS starts_on, ends_on::text AS ends_on, kind, note
                 FROM luminix.schedule_closures
                WHERE clinic_id = $1 AND ends_on >= $2::date AND starts_on <= $3::date
                ORDER BY starts_on, id LIMIT 200`,
            [tenant.clinicId, request.query.from.slice(0, 10), request.query.to.slice(0, 10)],
          ),
          connection.query(
            `SELECT city, state FROM luminix.locations
                WHERE clinic_id = $1 AND is_primary LIMIT 1`,
            [tenant.clinicId],
          ),
          connection.query(
            `SELECT o.professional_id, o.local_date::text AS local_date, o.is_available, o.periods, o.reason
                 FROM luminix.professional_schedule_overrides o
                 JOIN luminix.professionals p ON p.clinic_id = o.clinic_id AND p.id = o.professional_id
                WHERE o.clinic_id = $1 AND p.status = 'active'
                  AND o.local_date BETWEEN $2::date AND $3::date
                ORDER BY o.local_date, o.professional_id`,
            [tenant.clinicId, request.query.from.slice(0, 10), request.query.to.slice(0, 10)],
          ),
          // Dias reservados à locação (ADR-035): shown on the calendar.
          connection.query(
            `SELECT rr.starts_on::text AS starts_on, rr.ends_on::text AS ends_on, r.name
                 FROM luminix.resource_rentals rr
                 JOIN luminix.resources r ON r.clinic_id = rr.clinic_id AND r.id = rr.resource_id
                WHERE rr.clinic_id = $1 AND rr.available AND rr.exclusive AND r.status = 'active'
                  AND rr.ends_on >= $2::date AND rr.starts_on <= $3::date
                ORDER BY rr.starts_on LIMIT 100`,
            [tenant.clinicId, request.query.from.slice(0, 10), request.query.to.slice(0, 10)],
          ),
        ])
        // Reception sees the day; money and client details follow the person's level.
        const seesMoney = can.has('finance:manage')
        const seesClients = can.has('client:read')
        return {
          appointments: await Promise.all(
            appointments.rows.map(async ({ photo_key, ...row }) => ({
              ...row,
              price_cents: seesMoney ? row.price_cents : null,
              paid: isPaid(row),
              paid_cents: seesMoney ? toNumber(row.paid_cents) : null,
              client_phone: seesClients ? row.client_phone : null,
              client_notes: seesClients ? row.client_notes : null,
              client_photo_url: seesClients ? await clientPhotoUrl(photo_key) : null,
              client_photo_large_url: seesClients
                ? await clientPhotoUrl(largeKey(photo_key))
                : null,
              account_photo: seesClients && !photo_key && row.account_photo === true,
              package: packageView(row.package, seesMoney),
            })),
          ),
          canManage: can.has('agenda:manage'),
          canManageHours: can.has('schedule:manage'),
          canManageVacations: can.has('vacation:manage'),
          canManageTeam: can.has('professional:manage'),
          canCharge: seesMoney,
          canOpenClients: can.has('client:manage'),
          professionalAvailability: professionalDays.rows,
          professionalOverrides: professionalOverrides.rows,
          clients: await Promise.all(
            clients.rows.map(async ({ photo_key, ...row }) => ({
              ...row,
              photo_url: await clientPhotoUrl(photo_key),
              photo_large_url: await clientPhotoUrl(largeKey(photo_key)),
              account_photo: !photo_key && row.account_photo === true,
            })),
          ),
          services: services.rows,
          professionals: professionals.rows.map(({ photo_key, ...row }) => {
            let photo_url: string | null = null
            try {
              photo_url = photo_key ? publicMediaUrl(String(photo_key)) : null
            } catch {
              photo_url = null
            }
            return { ...row, photo_url }
          }),
          weeklyAvailability: weekly.rows,
          overrides: overrides.rows,
          closures: closures.rows,
          exclusiveRentals: exclusiveRentals.rows.map((row) => ({
            startsOn: String(row.starts_on),
            endsOn: String(row.ends_on),
            equipment: String(row.name),
          })),
          location: {
            city: location.rows[0]?.city ?? null,
            state: location.rows[0]?.state ?? null,
          },
          timezone: settings.rows[0]?.timezone ?? 'America/Sao_Paulo',
        }
      }),
  )

  app.post<{
    Params: { clinicId: string }
    Body: {
      clientId: string
      serviceId: string
      professionalId?: string
      localStartsAt: string
      notes?: string
      confirmedWarnings?: WarningCode[]
      confirmedOverlapIds?: string[]
      clientPackageId?: string
      voucherId?: string
    }
  }>(
    '/clinics/:clinicId/appointments',
    {
      bodyLimit: 8192,
      schema: {
        params: clinicParams,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['clientId', 'serviceId', 'localStartsAt'],
          properties: {
            clientId: { type: 'string', pattern: uuid },
            serviceId: { type: 'string', pattern: uuid },
            professionalId: { type: 'string', pattern: uuid },
            localStartsAt: { type: 'string', pattern: localStartPattern },
            notes: { type: 'string', maxLength: 4000 },
            confirmedWarnings: confirmedWarningsSchema,
            confirmedOverlapIds: {
              type: 'array',
              maxItems: 100,
              items: { type: 'string', pattern: uuid },
            },
            clientPackageId: { type: 'string', pattern: uuid },
            voucherId: { type: 'string', pattern: uuid },
          },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'agenda:manage', async (connection, tenant) => {
        await connection.query('SELECT luminix.expire_deposit_holds($1)', [tenant.clinicId])
        if (request.body.voucherId && request.body.clientPackageId)
          return reply.code(400).send({ error: 'Choose either a voucher or a package' })
        const service = (
          await connection.query(
            `SELECT id, name, duration_minutes, price_cents, price_type FROM luminix.services
              WHERE clinic_id = $1 AND id = $2 AND status = 'active'`,
            [tenant.clinicId, request.body.serviceId],
          )
        ).rows[0]
        const client = (
          await connection.query(
            `SELECT id FROM luminix.clinic_clients
              WHERE clinic_id = $1 AND id = $2 AND status = 'active'`,
            [tenant.clinicId, request.body.clientId],
          )
        ).rows[0]
        if (!service || !client) return reply.code(400).send({ error: 'Invalid appointment data' })
        if (request.body.professionalId) {
          const professional = (
            await connection.query(
              `SELECT id FROM luminix.professionals
                WHERE clinic_id = $1 AND id = $2 AND status = 'active'`,
              [tenant.clinicId, request.body.professionalId],
            )
          ).rows[0]
          if (!professional) return reply.code(400).send({ error: 'Invalid appointment data' })
        }
        const timezone = String(
          (
            await connection.query(
              'SELECT timezone FROM luminix.clinic_settings WHERE clinic_id = $1',
              [tenant.clinicId],
            )
          ).rows[0]?.timezone ?? 'America/Sao_Paulo',
        )
        const startsAt = zonedLocalToUtc(request.body.localStartsAt, timezone)
        if (Number.isNaN(startsAt.getTime()))
          return reply.code(400).send({ error: 'Invalid local appointment time' })
        // A combo visit does every service of the combo: it lasts what the combo says.
        const combo = request.body.clientPackageId
          ? (
              await connection.query(
                `SELECT duration_minutes FROM luminix.client_packages
                  WHERE clinic_id = $1 AND id = $2 AND kind = 'combo'`,
                [tenant.clinicId, request.body.clientPackageId],
              )
            ).rows[0]
          : undefined
        const minutes = Number(combo?.duration_minutes ?? service.duration_minutes)
        const endsAt = new Date(startsAt.getTime() + minutes * 60000)
        const warnings = await bookingWarnings(
          connection,
          tenant.clinicId,
          {
            startsAt,
            endsAt,
            timezone,
            professionalId: request.body.professionalId ?? null,
            serviceId: request.body.serviceId,
          },
          null,
        )
        const confirmed = new Set(request.body.confirmedWarnings ?? [])
        const overlap = warnings.find((warning) => warning.code === 'overlap')
        if (overlap?.conflictIds?.every((id) => request.body.confirmedOverlapIds?.includes(id)))
          confirmed.add('overlap')
        if (warnings.some((warning) => !confirmed.has(warning.code)))
          return reply.code(409).send({ error: 'Appointment requires confirmation', warnings })
        const result = await connection.query(
          `SELECT id, starts_at, ends_at, status, booking_source, override_reasons, notes
             FROM luminix.create_manager_appointment($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            tenant.clinicId,
            request.body.clientId,
            request.body.serviceId,
            request.body.professionalId ?? null,
            startsAt.toISOString(),
            endsAt.toISOString(),
            warnings.map((warning) => warning.code),
            request.body.notes?.trim() || null,
          ],
        )
        // A session of the client's package: checked and locked by the function (same client
        // and service, valid, with a session left); the appointment is not charged again.
        if (request.body.clientPackageId)
          await connection.query('SELECT luminix.use_client_package($1, $2, $3)', [
            tenant.clinicId,
            result.rows[0].id,
            request.body.clientPackageId,
          ])
        if (request.body.voucherId)
          await connection.query('SELECT luminix.redeem_client_voucher($1, $2, $3)', [
            tenant.clinicId,
            result.rows[0].id,
            request.body.voucherId,
          ])
        return reply.code(201).send({ appointment: result.rows[0], warnings })
      }),
  )

  app.put<{
    Params: { clinicId: string; appointmentId: string }
    Body: {
      status: 'scheduled' | 'confirmed' | 'completed' | 'canceled' | 'no_show'
      note?: string
    }
  }>(
    '/clinics/:clinicId/appointments/:appointmentId/status',
    {
      schema: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['clinicId', 'appointmentId'],
          properties: {
            ...clinicParams.properties,
            appointmentId: { type: 'string', pattern: uuid },
          },
        },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['status'],
          properties: {
            status: {
              type: 'string',
              enum: ['scheduled', 'confirmed', 'completed', 'canceled', 'no_show'],
            },
            // Why it was canceled; only with status "canceled".
            note: { type: 'string', maxLength: 300 },
          },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'agenda:manage', async (connection, tenant) => {
        if (request.body.status === 'canceled')
          await connection.query(
            'SELECT luminix.cancel_appointment($1::uuid, $2::uuid, $3::text)',
            [tenant.clinicId, request.params.appointmentId, request.body.note ?? null],
          )
        else
          await connection.query(
            'SELECT luminix.set_appointment_status($1::uuid, $2::uuid, $3::text)',
            [tenant.clinicId, request.params.appointmentId, request.body.status],
          )
        return { status: request.body.status }
      }),
  )

  // The client arrived ("check-in"); it stays open until it is completed.
  app.put<{
    Params: { clinicId: string; appointmentId: string }
    Body: {
      agreedPriceCents?: number
      payment?: { amountCents: number; method: string; description: string } | null
    }
  }>(
    '/clinics/:clinicId/appointments/:appointmentId/check-in',
    {
      schema: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['clinicId', 'appointmentId'],
          properties: {
            ...clinicParams.properties,
            appointmentId: { type: 'string', pattern: uuid },
          },
        },
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            agreedPriceCents: { type: 'integer', minimum: 0, maximum: 100000000 },
            payment: paymentBody,
          },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'agenda:manage', async (connection, tenant) => {
        const id = request.params.appointmentId
        await connection.query('SELECT luminix.check_in_appointment($1::uuid, $2::uuid)', [
          tenant.clinicId,
          id,
        ])
        // "A combinar"/"a partir de": the amount is set (and may be charged) at the door, in
        // the same transaction, so a check-in never leaves a half-recorded payment.
        await agreePrice(connection, tenant.clinicId, id, request.body?.agreedPriceCents)
        await recordVisitPayment(connection, tenant.clinicId, id, request.body?.payment)
        return { checkedIn: true }
      }),
  )

  // Sinal por Pix (ADR-037): the team saw it in the bank. It becomes a Pix payment of the visit.
  app.post<{ Params: { clinicId: string; appointmentId: string } }>(
    '/clinics/:clinicId/appointments/:appointmentId/deposit/confirm',
    {
      schema: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['clinicId', 'appointmentId'],
          properties: {
            ...clinicParams.properties,
            appointmentId: { type: 'string', pattern: uuid },
          },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'agenda:manage', async (connection, tenant) => {
        await connection.query('SELECT luminix.staff_confirm_deposit($1::uuid, $2::uuid)', [
          tenant.clinicId,
          request.params.appointmentId,
        ])
        return { confirmed: true }
      }),
  )

  // Confirmation link (ADR-038): a new link for an upcoming visit, replacing the previous one.
  // The team copies it to WhatsApp and/or sends it by e-mail (only when the client has one).
  app.post<{
    Params: { clinicId: string; appointmentId: string }
    Body: { sendEmail?: boolean }
  }>(
    '/clinics/:clinicId/appointments/:appointmentId/confirmation-link',
    {
      bodyLimit: 512,
      schema: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['clinicId', 'appointmentId'],
          properties: {
            ...clinicParams.properties,
            appointmentId: { type: 'string', pattern: uuid },
          },
        },
        body: {
          type: 'object',
          additionalProperties: false,
          properties: { sendEmail: { type: 'boolean' } },
        },
      },
    },
    async (request, reply) => {
      const { token, hash } = newLinkToken()
      const url = appointmentLinkUrl(token)
      const result = await authorized(
        request,
        reply,
        'agenda:manage',
        async (connection, tenant) => {
          if (!url) {
            reply.code(503)
            return { error: 'Link unavailable' }
          }
          const expiresAt = (
            await connection.query(
              'SELECT luminix.staff_issue_appointment_link($1::uuid, $2::uuid, $3) AS expires_at',
              [tenant.clinicId, request.params.appointmentId, hash],
            )
          ).rows[0]?.expires_at
          const row = (
            await connection.query(
              `SELECT cc.display_name, cc.contact_email, s.name AS service_name,
                    p.display_name AS professional_name,
                    to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS local_date,
                    to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS local_time
               FROM luminix.appointments a
               JOIN luminix.clinic_clients cc ON cc.clinic_id = a.clinic_id AND cc.id = a.clinic_client_id
               JOIN luminix.services s ON s.clinic_id = a.clinic_id AND s.id = a.service_id
               LEFT JOIN luminix.professionals p ON p.clinic_id = a.clinic_id AND p.id = a.professional_id
              WHERE a.clinic_id = $1 AND a.id = $2`,
              [tenant.clinicId, request.params.appointmentId],
            )
          ).rows[0]
          const to = row?.contact_email ? String(row.contact_email) : null
          const email =
            request.body?.sendEmail && to && row
              ? appointmentLinkEmail({
                  ...(await loadClinicContact(connection, tenant.clinicId)),
                  to,
                  linkUrl: url,
                  clientName: String(row.display_name),
                  serviceName: String(row.service_name),
                  professionalName: row.professional_name ? String(row.professional_name) : null,
                  dateLabel: dateLabel(String(row.local_date)),
                  timeLabel: String(row.local_time),
                  priceLabel: null,
                })
              : null
          return {
            url,
            expiresAt: expiresAt ? new Date(String(expiresAt)).toISOString() : null,
            hasEmail: Boolean(to),
            email,
          }
        },
      )
      if (reply.sent || !result || typeof result !== 'object' || !('url' in result)) return result
      const { email, ...body } = result as unknown as {
        email: Parameters<typeof sendLater>[1]
      } & Record<string, unknown>
      sendLater(mail, email, request.log)
      return { ...body, emailed: Boolean(email && mail?.mailer) }
    },
  )

  // Money at the desk without changing the visit: the agreed amount of "a combinar"/"a partir
  // de" and/or a payment (also before the visit). Package sessions pay their installment.
  app.put<{
    Params: { clinicId: string; appointmentId: string }
    Body: {
      agreedPriceCents?: number
      payment?: { amountCents: number; method: string; description: string } | null
    }
  }>(
    '/clinics/:clinicId/appointments/:appointmentId/charge',
    {
      bodyLimit: 2048,
      schema: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['clinicId', 'appointmentId'],
          properties: {
            ...clinicParams.properties,
            appointmentId: { type: 'string', pattern: uuid },
          },
        },
        body: {
          type: 'object',
          additionalProperties: false,
          minProperties: 1,
          properties: {
            agreedPriceCents: { type: 'integer', minimum: 0, maximum: 100000000 },
            payment: paymentBody,
          },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'finance:manage', async (connection, tenant) => {
        const id = request.params.appointmentId
        await agreePrice(connection, tenant.clinicId, id, request.body.agreedPriceCents)
        await recordVisitPayment(connection, tenant.clinicId, id, request.body.payment)
        return { saved: true }
      }),
  )

  // What finishing this appointment uses from the stock (the service recipe), for the
  // "concluir atendimento" step. Reception sees names and amounts, never costs.
  app.get<{ Params: { clinicId: string; appointmentId: string } }>(
    '/clinics/:clinicId/appointments/:appointmentId/supplies',
    {
      schema: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['clinicId', 'appointmentId'],
          properties: {
            ...clinicParams.properties,
            appointmentId: { type: 'string', pattern: uuid },
          },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'agenda:manage', async (connection, tenant) => {
        const { rows } = await connection.query(
          'SELECT * FROM luminix.appointment_supplies($1::uuid, $2::uuid)',
          [tenant.clinicId, request.params.appointmentId],
        )
        return {
          supplies: rows.map((row) => ({
            itemId: String(row.item_id),
            name: String(row.name),
            unit: String(row.unit),
            packageSize: row.package_size == null ? null : Number(row.package_size),
            packageLabel: row.package_label ? String(row.package_label) : null,
            quantity: Number(row.quantity),
            stock: Number(row.stock),
            consumed: row.consumed == null ? null : Number(row.consumed),
          })),
        }
      }),
  )

  // Completes the appointment, consumes what was used and, optionally, records a payment: all
  // in one transaction, so a failed payment never leaves the stock half discounted.
  app.put<{
    Params: { clinicId: string; appointmentId: string }
    Body: {
      supplies: { itemId: string; quantity: number }[]
      payment: { amountCents: number; method: string; description: string } | null
      agreedPriceCents?: number
    }
  }>(
    '/clinics/:clinicId/appointments/:appointmentId/complete',
    {
      bodyLimit: 16384,
      schema: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['clinicId', 'appointmentId'],
          properties: {
            ...clinicParams.properties,
            appointmentId: { type: 'string', pattern: uuid },
          },
        },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['supplies', 'payment'],
          properties: {
            supplies: {
              type: 'array',
              maxItems: 40,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['itemId', 'quantity'],
                properties: {
                  itemId: { type: 'string', pattern: uuid },
                  quantity: { type: 'number', minimum: 0, maximum: 999999, multipleOf: 0.01 },
                },
              },
            },
            payment: paymentBody,
            agreedPriceCents: { type: 'integer', minimum: 0, maximum: 100000000 },
          },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'agenda:manage', async (connection, tenant) => {
        const id = request.params.appointmentId
        await connection.query(
          "SELECT luminix.set_appointment_status($1::uuid, $2::uuid, 'completed')",
          [tenant.clinicId, id],
        )
        const consumed = request.body.supplies.length
          ? toNumber(
              (
                await connection.query(
                  'SELECT luminix.consume_appointment_supplies($1::uuid, $2::uuid, $3::jsonb) AS n',
                  [
                    tenant.clinicId,
                    id,
                    JSON.stringify(
                      request.body.supplies.map((item) => ({
                        ...item,
                        quantity: String(item.quantity),
                      })),
                    ),
                  ],
                )
              ).rows[0]?.n,
            )
          : 0
        await agreePrice(connection, tenant.clinicId, id, request.body.agreedPriceCents)
        await recordVisitPayment(connection, tenant.clinicId, id, request.body.payment)
        return { completed: true, consumed }
      }),
  )

  // Moves an appointment that is still to happen; same warnings as a new booking.
  app.put<{
    Params: { clinicId: string; appointmentId: string }
    Body: { localStartsAt: string; confirmedWarnings?: WarningCode[] }
  }>(
    '/clinics/:clinicId/appointments/:appointmentId/reschedule',
    {
      bodyLimit: 2048,
      schema: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['clinicId', 'appointmentId'],
          properties: {
            ...clinicParams.properties,
            appointmentId: { type: 'string', pattern: uuid },
          },
        },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['localStartsAt'],
          properties: {
            localStartsAt: { type: 'string', pattern: localStartPattern },
            confirmedWarnings: confirmedWarningsSchema,
          },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'agenda:manage', async (connection, tenant) => {
        const current = (
          await connection.query(
            `SELECT a.professional_id, a.status, coalesce(cp.duration_minutes, s.duration_minutes) AS duration_minutes, a.service_id
               FROM luminix.appointments a
               JOIN luminix.services s ON s.clinic_id = a.clinic_id AND s.id = a.service_id
               LEFT JOIN luminix.client_packages cp ON cp.clinic_id = a.clinic_id
                 AND cp.id = a.client_package_id AND cp.kind = 'combo'
              WHERE a.clinic_id = $1 AND a.id = $2`,
            [tenant.clinicId, request.params.appointmentId],
          )
        ).rows[0]
        if (!current) return reply.code(404).send({ error: 'Appointment not found' })
        if (!activeAppointmentStatuses.includes(String(current.status)))
          return reply.code(409).send({ error: 'Appointment is closed' })
        const timezone = String(
          (
            await connection.query(
              'SELECT timezone FROM luminix.clinic_settings WHERE clinic_id = $1',
              [tenant.clinicId],
            )
          ).rows[0]?.timezone ?? 'America/Sao_Paulo',
        )
        const startsAt = zonedLocalToUtc(request.body.localStartsAt, timezone)
        if (Number.isNaN(startsAt.getTime()))
          return reply.code(400).send({ error: 'Invalid local appointment time' })
        const endsAt = new Date(startsAt.getTime() + Number(current.duration_minutes) * 60000)
        const warnings = await bookingWarnings(
          connection,
          tenant.clinicId,
          {
            startsAt,
            endsAt,
            timezone,
            professionalId: current.professional_id ? String(current.professional_id) : null,
            serviceId: String(current.service_id),
          },
          request.params.appointmentId,
        )
        const confirmed = new Set(request.body.confirmedWarnings ?? [])
        if (warnings.some((warning) => !confirmed.has(warning.code)))
          return reply.code(409).send({ error: 'Appointment requires confirmation', warnings })
        await connection.query(
          'SELECT luminix.reschedule_appointment($1::uuid, $2::uuid, $3::timestamptz, $4::timestamptz, $5::text[])',
          [
            tenant.clinicId,
            request.params.appointmentId,
            startsAt.toISOString(),
            endsAt.toISOString(),
            warnings.map((warning) => warning.code),
          ],
        )
        return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), warnings }
      }),
  )

  app.put<{
    Params: { clinicId: string }
    Body:
      | {
          mode: 'weekly'
          days: Array<{ weekday: number; isAvailable: boolean; periods: Period[] }>
          confirmCancellations?: boolean
        }
      | {
          mode: 'override'
          date: string
          useDefault?: boolean
          isAvailable?: boolean
          periods?: Period[]
          reason?: string
          confirmCancellations?: boolean
        }
  }>(
    '/clinics/:clinicId/availability',
    {
      bodyLimit: 16384,
      schema: {
        params: clinicParams,
        body: {
          oneOf: [
            {
              type: 'object',
              additionalProperties: false,
              required: ['mode', 'days'],
              properties: {
                mode: { const: 'weekly' },
                confirmCancellations: confirmCancellationsSchema,
                days: {
                  type: 'array',
                  minItems: 7,
                  maxItems: 7,
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['weekday', 'isAvailable', 'periods'],
                    properties: {
                      weekday: { type: 'integer', minimum: 0, maximum: 6 },
                      isAvailable: { type: 'boolean' },
                      periods: periodSchema,
                    },
                  },
                },
              },
            },
            {
              type: 'object',
              additionalProperties: false,
              required: ['mode', 'date'],
              properties: {
                mode: { const: 'override' },
                confirmCancellations: confirmCancellationsSchema,
                date: { type: 'string', pattern: ymd },
                useDefault: { type: 'boolean' },
                isAvailable: { type: 'boolean' },
                periods: periodSchema,
                reason: { type: 'string', maxLength: 240 },
              },
            },
          ],
        },
      },
    },
    async (request, reply) =>
      withCancellationMail(mail, reply, (outbox) =>
        authorized(request, reply, 'schedule:manage', async (connection, tenant) => {
          // Who loses their time with the new hours (ADR-035): confirmed in a dialog first.
          const before = await fittingAppointments(connection, tenant.clinicId)
          const settle = async (reason: string) => {
            const result = await settleScheduleImpact(connection, tenant.clinicId, before, {
              confirm: request.body.confirmCancellations === true,
              reason,
              permission: 'schedule:manage',
            })
            outbox.push(...result.emails)
            return result.canceled
          }
          if (request.body.mode === 'weekly') {
            const weekdays = new Set(request.body.days.map((day) => day.weekday))
            if (
              weekdays.size !== 7 ||
              request.body.days.some(
                (day) => !validPeriods(day.periods) || (!day.isAvailable && day.periods.length),
              )
            )
              return reply.code(400).send({ error: 'Invalid availability' })
            for (const day of request.body.days) {
              await connection.query(
                'SELECT luminix.save_weekly_availability($1, $2::smallint, $3, $4::jsonb)',
                [tenant.clinicId, day.weekday, day.isAvailable, JSON.stringify(day.periods)],
              )
            }
            const canceledAppointments = await settle('O espaço mudou o horário de atendimento.')
            return { availability: request.body.days, canceledAppointments }
          }
          if (request.body.useDefault) {
            await connection.query(
              'SELECT luminix.save_schedule_override($1, $2::date, true, false, $3::jsonb, null)',
              [tenant.clinicId, request.body.date, JSON.stringify([])],
            )
            const canceledAppointments = await settle('O espaço mudou o horário deste dia.')
            return { override: null, canceledAppointments }
          }
          const periods = request.body.periods ?? []
          const isAvailable = request.body.isAvailable ?? false
          if (!validPeriods(periods) || (!isAvailable && periods.length))
            return reply.code(400).send({ error: 'Invalid availability' })
          await connection.query(
            'SELECT luminix.save_schedule_override($1, $2::date, false, $3, $4::jsonb, $5)',
            [
              tenant.clinicId,
              request.body.date,
              isAvailable,
              JSON.stringify(periods),
              request.body.reason?.trim() || null,
            ],
          )
          const canceledAppointments = await settle(
            isAvailable
              ? 'O espaço mudou o horário deste dia.'
              : `O espaço não vai abrir neste dia${request.body.reason?.trim() ? ` (${request.body.reason.trim()})` : ''}.`,
          )
          return {
            override: {
              local_date: request.body.date,
              is_available: isAvailable,
              periods,
              reason: request.body.reason?.trim() || null,
            },
            canceledAppointments,
          }
        }),
      ),
  )

  // "Planejar semanas": several days at once (the space and/or professionals), in one
  // transaction. Each entry either restores the default (useDefault) or sets that day's hours.
  app.put<{
    Params: { clinicId: string }
    Body: {
      days: {
        date: string
        professionalId: string | null
        useDefault?: boolean
        isAvailable?: boolean
        periods?: Period[]
        reason?: string
      }[]
      confirmCancellations?: boolean
    }
  }>(
    '/clinics/:clinicId/schedule-plan',
    {
      bodyLimit: 65536,
      schema: {
        params: clinicParams,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['days'],
          properties: {
            confirmCancellations: confirmCancellationsSchema,
            days: {
              type: 'array',
              minItems: 1,
              maxItems: 120,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['date', 'professionalId'],
                properties: {
                  date: { type: 'string', pattern: ymd },
                  professionalId: { type: ['string', 'null'], pattern: uuid },
                  useDefault: { type: 'boolean' },
                  isAvailable: { type: 'boolean' },
                  periods: periodSchema,
                  reason: { type: 'string', maxLength: 240 },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const days = request.body.days
      const keys = new Set(days.map((day) => `${day.professionalId ?? ''}|${day.date}`))
      if (
        keys.size !== days.length ||
        days.some(
          (day) =>
            !day.useDefault &&
            (!validPeriods(day.periods ?? []) ||
              (!day.isAvailable && (day.periods ?? []).length) ||
              (day.isAvailable && !(day.periods ?? []).length)),
        )
      )
        return reply.code(400).send({ error: 'Invalid availability' })
      // One-off days (space or professional) need schedule:manage; the SQL functions re-check.
      return withCancellationMail(mail, reply, (outbox) =>
        authorized(request, reply, 'schedule:manage', async (connection, tenant) => {
          const before = await fittingAppointments(connection, tenant.clinicId)
          for (const day of days) {
            const periods = JSON.stringify(day.useDefault ? [] : (day.periods ?? []))
            const reason = day.useDefault ? null : day.reason?.trim() || null
            if (day.professionalId)
              await connection.query(
                'SELECT luminix.save_professional_override($1, $2, $3::date, $4, $5, $6::jsonb, $7)',
                [
                  tenant.clinicId,
                  day.professionalId,
                  day.date,
                  day.useDefault === true,
                  day.isAvailable === true,
                  periods,
                  reason,
                ],
              )
            else
              await connection.query(
                'SELECT luminix.save_schedule_override($1, $2::date, $3, $4, $5::jsonb, $6)',
                [
                  tenant.clinicId,
                  day.date,
                  day.useDefault === true,
                  day.isAvailable === true,
                  periods,
                  reason,
                ],
              )
          }
          const result = await settleScheduleImpact(connection, tenant.clinicId, before, {
            confirm: request.body.confirmCancellations === true,
            reason: 'O espaço mudou os horários desta semana.',
            permission: 'schedule:manage',
          })
          outbox.push(...result.emails)
          return { saved: days.length, canceledAppointments: result.canceled }
        }),
      )
    },
  )

  const closureBody = {
    type: 'object',
    additionalProperties: false,
    required: ['startsOn', 'endsOn', 'kind'],
    properties: {
      professionalId: { type: ['string', 'null'], pattern: uuid },
      startsOn: { type: 'string', pattern: ymd },
      endsOn: { type: 'string', pattern: ymd },
      kind: { type: 'string', enum: Object.keys(closureLabel) },
      note: { type: 'string', maxLength: 240 },
      confirmCancellations: confirmCancellationsSchema,
    },
  } as const
  type ClosureBody = {
    professionalId?: string | null
    startsOn: string
    endsOn: string
    kind: ClosureKind
    note?: string
    confirmCancellations?: boolean
  }
  const closureColumns = `id, professional_id, starts_on::text AS starts_on,
    ends_on::text AS ends_on, kind, note`

  async function saveClosure(
    request: FastifyRequest<{
      Params: { clinicId: string; closureId?: string }
      Body: ClosureBody
    }>,
    reply: FastifyReply,
  ) {
    const body = request.body
    const days = (Date.parse(body.endsOn) - Date.parse(body.startsOn)) / 86_400_000
    if (!(days >= 0 && days <= 366)) return reply.code(400).send({ error: 'Invalid period' })
    // Vacations and leaves need vacation:manage; other closures schedule:manage. The function
    // re-checks, including the previous kind on an edit.
    return withCancellationMail(mail, reply, (outbox) =>
      authorized(request, reply, closurePermission(body.kind), async (connection, tenant) => {
        const before = await fittingAppointments(connection, tenant.clinicId)
        const saved = await connection.query(
          `SELECT ${closureColumns}
             FROM luminix.save_schedule_closure($1, $2, $3, $4::date, $5::date, $6, $7)`,
          [
            tenant.clinicId,
            request.params.closureId ?? null,
            body.professionalId || null,
            body.startsOn,
            body.endsOn,
            body.kind,
            body.note?.trim() || null,
          ],
        )
        // Appointments inside the period are listed for the manager, then canceled (ADR-035).
        const who = body.professionalId
          ? (
              await connection.query(
                'SELECT display_name FROM luminix.professionals WHERE clinic_id = $1 AND id = $2',
                [tenant.clinicId, body.professionalId],
              )
            ).rows[0]?.display_name
          : null
        const label = closureLabel[body.kind] ?? 'Período sem atendimento'
        const result = await settleScheduleImpact(connection, tenant.clinicId, before, {
          confirm: body.confirmCancellations === true,
          reason: who
            ? `${String(who)} não vai atender neste período (${label.toLowerCase()}).`
            : `O espaço estará fechado neste período (${label.toLowerCase()}).`,
          permission: closurePermission(body.kind),
        })
        outbox.push(...result.emails)
        return reply.code(request.params.closureId ? 200 : 201).send({
          closure: saved.rows[0],
          canceledAppointments: result.canceled,
        })
      }),
    )
  }

  app.get<{
    Params: { clinicId: string }
    Querystring: { professionalId?: string; history?: string }
  }>(
    '/clinics/:clinicId/closures',
    {
      schema: {
        params: clinicParams,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            // One professional's periods (Configurações → Equipe); with history, also the old ones.
            professionalId: { type: 'string', pattern: uuid },
            history: { type: 'string', enum: ['1'] },
          },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'agenda:read', async (connection, tenant) => {
        const { professionalId, history } = request.query
        const result = await connection.query(
          `SELECT ${closureColumns} FROM luminix.schedule_closures
             WHERE clinic_id = $1
               AND ($2::uuid IS NULL OR professional_id = $2::uuid)
               AND ($3::boolean OR ends_on >= (now() AT TIME ZONE 'UTC')::date - 31)
             ORDER BY starts_on, id LIMIT 200`,
          [tenant.clinicId, professionalId ?? null, history === '1' && Boolean(professionalId)],
        )
        return { closures: result.rows }
      }),
  )

  app.post<{ Params: { clinicId: string }; Body: ClosureBody }>(
    '/clinics/:clinicId/closures',
    { bodyLimit: 4096, schema: { params: clinicParams, body: closureBody } },
    saveClosure,
  )

  app.put<{ Params: { clinicId: string; closureId: string }; Body: ClosureBody }>(
    '/clinics/:clinicId/closures/:closureId',
    {
      bodyLimit: 4096,
      schema: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['clinicId', 'closureId'],
          properties: { ...clinicParams.properties, closureId: { type: 'string', pattern: uuid } },
        },
        body: closureBody,
      },
    },
    saveClosure,
  )

  // POST (not DELETE) like the other removals that go through the admin proxy.
  app.post<{ Params: { clinicId: string; closureId: string } }>(
    '/clinics/:clinicId/closures/:closureId/remove',
    {
      schema: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['clinicId', 'closureId'],
          properties: { ...clinicParams.properties, closureId: { type: 'string', pattern: uuid } },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'agenda:read', async (connection, tenant) => {
        const result = await connection.query(
          'SELECT luminix.delete_schedule_closure($1, $2) AS deleted',
          [tenant.clinicId, request.params.closureId],
        )
        if (!result.rows[0]?.deleted) return reply.code(404).send({ error: 'Closure not found' })
        return { deleted: true }
      }),
  )
}
