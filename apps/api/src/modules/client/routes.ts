import { appointmentRentalDates } from '../operations/rental-calendar.js'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { SqlConnection } from '../../shared/database/migrations.js'
import { createStaffAuthenticator, type AuthDependencies } from '../../shared/auth/staff-session.js'
import type { TenantPool } from '../../shared/tenant/clinic-transaction.js'
import { publicMediaUrl } from '../clinics/media-storage.js'
import { isPaid } from '../../shared/tenant/route-helpers.js'
import { localDateTime, zonedLocalToUtc } from '../operations/routes.js'
import { pixCopyPaste, type PixKeyType } from '../../shared/pix.js'
import { connectReady, createConnectProvider } from '../payments/stripe-connect.js'
import { refundDue } from '../payments/refunds.js'
import {
  createOnlinePaymentsProvider,
  PixUnavailableError,
  type OnlinePaymentsProvider,
} from '../payments/online-checkout.js'

// Client area API (ADR-029). The person comes only from the verified Firebase token; the clinic
// comes from a slug the person is linked to, resolved by `client_clinic_scope`. Reads then run
// under the clinic RLS scope and are filtered by the person's own local record.

type Period = { start: string; end: string }
type Scope = {
  clinicId: string
  clientId: string
  sex: string | null
  /** Why the space cannot take bookings from this person yet, if anything. */
  recordProblem: string | null
}

const uuid = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
const slug = '^[a-z0-9]+(-[a-z0-9]+)*$'
const localStart = '^\\d{4}-\\d{2}-\\d{2}T(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
const ymd = '^\\d{4}-\\d{2}-\\d{2}$'
const timezone = 'America/Sao_Paulo'
const slotStepMinutes = 30
const active = ['scheduled', 'confirmed']

const slugParams = {
  type: 'object',
  additionalProperties: false,
  required: ['slug'],
  properties: { slug: { type: 'string', pattern: slug, maxLength: 80 } },
} as const

const appointmentParams = {
  type: 'object',
  additionalProperties: false,
  required: ['slug', 'appointmentId'],
  properties: {
    slug: { type: 'string', pattern: slug, maxLength: 80 },
    appointmentId: { type: 'string', pattern: uuid },
  },
} as const

// Answers follow the shared script in packages/contracts (ADR-030). The API checks the shape and
// the keys each level requires; the wording and step order live in the clients.
const anamnesisBody = {
  type: 'object',
  additionalProperties: false,
  required: ['level', 'answers', 'photo', 'consent'],
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
    photo: {
      type: 'string',
      pattern: '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$',
      maxLength: 400000,
    },
    consent: { type: 'boolean', const: true },
  },
} as const

type Level = 1 | 2 | 3
type AnamnesisBody = {
  level: Level
  answers: Record<string, string | boolean | number | string[]>
  photo: string
  consent: true
}

/** Keys each level must answer (mirrors `required` of the shared steps). */
const requiredKeys: Record<Level, string[]> = {
  1: ['sex', 'birthDate', 'allergies', 'cosmeticAllergy'],
  2: ['diagnosedDisease', 'medicalTreatment', 'continuousMedications', 'aestheticReaction'],
  3: [
    'physicalLimitation',
    'smoking',
    'alcohol',
    'physicalActivity',
    'waterIntake',
    'skinType',
    'previousAesthetic',
  ],
}

export function missingKeys(level: number, answers: Record<string, unknown>) {
  const keys = ([1, 2, 3] as const)
    .filter((item) => item <= level)
    .flatMap((item) => requiredKeys[item])
  if (level >= 2 && answers.sex === 'female') keys.push('pregnant')
  return keys.filter((key) => answers[key] === undefined || answers[key] === '')
}

function validRecord(body: AnamnesisBody) {
  const { sex, birthDate } = body.answers
  if (!['female', 'male'].includes(String(sex))) return false
  if (typeof birthDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return false
  const birth = Date.parse(`${birthDate}T12:00:00Z`)
  return (
    birth > Date.parse('1900-01-01') &&
    birth < Date.now() &&
    !missingKeys(body.level, body.answers).length
  )
}

function record(body: AnamnesisBody) {
  return {
    version: 2,
    level: body.level,
    answeredAt: new Date().toISOString(),
    answers: body.answers,
  }
}

/** Levels II–III are asked again every year; level I does not expire. */
function recordProblem(raw: unknown, hasPhoto: boolean, requiredLevel: number) {
  const value = raw as {
    version?: number
    level?: number
    answeredAt?: string
    answers?: Record<string, unknown>
  } | null
  if (!value || !hasPhoto) return 'Record required'
  const level = value.version === 2 ? Number(value.level ?? 1) : 1
  const answers = value.version === 2 ? (value.answers ?? {}) : (value as Record<string, unknown>)
  if (level < requiredLevel || missingKeys(requiredLevel, answers).length) {
    // Version 1 records only had sex and birth date: they serve level I spaces.
    if (!(value.version !== 2 && requiredLevel === 1)) return 'Record required'
  }
  if (level >= 2 && Date.parse(value.answeredAt ?? '') + 365 * 86_400_000 < Date.now())
    return 'Record expired'
  return null
}

/** Browser origins of the client area. Bearer tokens only: no cookies cross these origins. */
function allowedOrigins() {
  return new Set([
    'https://luminix.beauty',
    'https://www.luminix.beauty',
    'https://luminix-web.vercel.app',
    'https://luminix-client.vercel.app',
    ...(process.env.CLIENT_WEB_ORIGINS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    ...(process.env.NODE_ENV !== 'production'
      ? ['http://localhost:3001', 'http://localhost:8081', 'http://localhost:19006']
      : []),
  ])
}

function minutes(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

const clock = (value: number) =>
  `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`

function intersect(left: Period[], right: Period[]): Period[] {
  const result: Period[] = []
  for (const a of left)
    for (const b of right) {
      const start = Math.max(minutes(a.start), minutes(b.start))
      const end = Math.min(minutes(a.end), minutes(b.end))
      if (start < end) result.push({ start: clock(start), end: clock(end) })
    }
  return result
}

/** Database errors raised on purpose by the client functions, mapped to safe answers. */
function sqlFailure(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  const code = (error as { code?: string })?.code
  if (code === '23P01' || message.includes('Slot taken'))
    return { status: 409, error: 'Slot taken' }
  if (message.includes('Equipment unavailable'))
    return { status: 409, error: 'Service unavailable' }
  if (message.includes('Cancellation closed')) return { status: 409, error: 'Cancellation closed' }
  if (message.includes('Rescheduling closed')) return { status: 409, error: 'Rescheduling closed' }
  if (message.includes('Deposit unavailable')) return { status: 409, error: 'Deposit unavailable' }
  if (code === '42501') return { status: 403, error: 'Access denied' }
  if (code === '22023' || code === '23514' || code === '22P02')
    return { status: 400, error: 'Invalid request' }
  return null
}

export async function clientRoutes(app: FastifyInstance, dependencies: AuthDependencies) {
  // Own counter, more generous than the staff one: browsing days and times is many small reads.
  const authenticate = createStaffAuthenticator(dependencies, 120)
  const pool: TenantPool | undefined = dependencies.tenantPool
  // Pay the visit in the app (ADR-040). Absent provider: read from env; null: disabled.
  let onlinePayments: OnlinePaymentsProvider | null | undefined = dependencies.onlinePayments
  const payments = () => {
    if (onlinePayments === undefined) onlinePayments = createOnlinePaymentsProvider()
    return onlinePayments
  }
  /** Where the client lands after the Stripe page (the site's client agenda). */
  const paymentReturnUrl = () => {
    const fallback = process.env.NODE_ENV !== 'production' ? 'http://localhost:3001' : undefined
    const raw = process.env.PUBLIC_CLINIC_WEB_ORIGIN || fallback
    try {
      const url = raw ? new URL(raw) : null
      const local = url?.hostname === 'localhost' && process.env.NODE_ENV !== 'production'
      return url && (url.protocol === 'https:' || local) ? `${url.origin}/cliente/agenda` : null
    } catch {
      return null
    }
  }
  const origins = allowedOrigins()

  // CORS only for /client routes: the web area and the app's web build call the API directly.
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/client/')) return
    const origin = request.headers.origin
    // Development servers move between local ports; production accepts only the listed origins.
    const localDev =
      process.env.NODE_ENV !== 'production' && /^http:\/\/localhost:\d{2,5}$/.test(origin ?? '')
    if (origin && (origins.has(origin) || localDev)) {
      reply.header('Access-Control-Allow-Origin', origin)
      reply.header('Vary', 'Origin')
      reply.header('Access-Control-Allow-Headers', 'authorization, content-type')
      reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE')
      reply.header('Access-Control-Max-Age', '600')
    }
  })
  app.options('/client/*', async (_request, reply) => reply.code(204).send())

  /** One transaction as the verified person; optionally scoped to a linked clinic. */
  async function asClient<T>(
    request: FastifyRequest,
    reply: FastifyReply,
    clinicSlug: string | null,
    work: (connection: SqlConnection, scope: Scope | null) => Promise<T>,
  ) {
    const identityId = await authenticate(request, reply)
    if (!identityId) return
    if (!pool) return reply.code(503).send({ error: 'Client area unavailable' })
    const connection = await pool.connect()
    let discard = false
    try {
      await connection.query('BEGIN')
      await connection.query("SELECT set_config('luminix.identity_id', $1, true)", [identityId])
      let scope: Scope | null = null
      if (clinicSlug) {
        const found = (
          await connection.query('SELECT * FROM luminix.client_clinic_scope($1)', [clinicSlug])
        ).rows[0]
        if (!found) {
          await connection.query('ROLLBACK')
          return reply.code(404).send({ error: 'Space not linked' })
        }
        scope = {
          clinicId: String(found.clinic_id),
          clientId: String(found.clinic_client_id),
          sex: found.client_sex ? String(found.client_sex) : null,
          recordProblem: recordProblem(
            found.anamnesis,
            Boolean(found.has_photo),
            Number(found.required_level ?? 1),
          ),
        }
        await connection.query("SELECT set_config('luminix.clinic_id', $1, true)", [scope.clinicId])
      }
      const result = await work(connection, scope)
      await connection.query('COMMIT')
      return result
    } catch (error) {
      try {
        await connection.query('ROLLBACK')
      } catch {
        discard = true
      }
      const failure = sqlFailure(error)
      if (failure) return reply.code(failure.status).send({ error: failure.error })
      request.log.warn({ event: 'client_request_failed' }, 'Client request failed')
      return reply.code(503).send({ error: 'Client area unavailable' })
    } finally {
      connection.release(discard)
    }
  }

  app.get('/client/me', async (request, reply) =>
    asClient(request, reply, null, async (connection) => {
      const me = (await connection.query('SELECT luminix.client_me() AS me')).rows[0]?.me
      return me ?? { profile: null, spaces: [] }
    }),
  )

  app.put<{ Body: { name: string; email: string; phone?: string } }>(
    '/client/me',
    {
      bodyLimit: 4096,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'email'],
          properties: {
            name: { type: 'string', minLength: 2, maxLength: 160 },
            email: { type: 'string', format: 'email', maxLength: 254 },
            phone: { type: 'string', maxLength: 30 },
          },
        },
      },
    },
    async (request, reply) => {
      const digits = (request.body.phone ?? '').replace(/\D/g, '')
      // Brazilian numbers typed without country code become E.164.
      const phone = !digits
        ? null
        : digits.length >= 12 && digits.startsWith('55')
          ? `+${digits}`
          : digits.length === 10 || digits.length === 11
            ? `+55${digits}`
            : null
      if (digits && !phone) return reply.code(400).send({ error: 'Invalid phone' })
      return asClient(request, reply, null, async (connection) => {
        await connection.query('SELECT luminix.client_save_profile($1, $2, $3)', [
          request.body.name.trim(),
          request.body.email.trim().toLowerCase(),
          phone,
        ])
        return { ok: true }
      })
    },
  )

  app.put<{ Body: AnamnesisBody }>(
    '/client/me/anamnesis',
    { bodyLimit: 450_000, schema: { body: anamnesisBody } },
    async (request, reply) => {
      if (!validRecord(request.body)) return reply.code(400).send({ error: 'Invalid birth date' })
      return asClient(request, reply, null, async (connection) => {
        await connection.query('SELECT luminix.client_save_anamnesis(NULL, $1::jsonb, $2)', [
          JSON.stringify(record(request.body)),
          request.body.photo,
        ])
        return { ok: true }
      })
    },
  )

  app.put<{ Params: { slug: string }; Body: AnamnesisBody }>(
    '/client/spaces/:slug/anamnesis',
    { bodyLimit: 450_000, schema: { params: slugParams, body: anamnesisBody } },
    async (request, reply) => {
      if (!validRecord(request.body)) return reply.code(400).send({ error: 'Invalid birth date' })
      return asClient(request, reply, null, async (connection) => {
        await connection.query('SELECT luminix.client_save_anamnesis($1, $2::jsonb, $3)', [
          request.params.slug,
          JSON.stringify(record(request.body)),
          request.body.photo,
        ])
        return { ok: true }
      })
    },
  )

  app.post<{ Body: { slug: string; shareAnamnesis: boolean } }>(
    '/client/spaces',
    {
      bodyLimit: 1024,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['slug', 'shareAnamnesis'],
          properties: {
            slug: { type: 'string', pattern: slug, maxLength: 80 },
            shareAnamnesis: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) =>
      asClient(request, reply, null, async (connection) => {
        await connection.query('SELECT luminix.client_join_clinic($1, $2)', [
          request.body.slug,
          request.body.shareAnamnesis,
        ])
        return reply.code(201).send({ ok: true })
      }),
  )

  app.delete<{ Params: { slug: string } }>(
    '/client/spaces/:slug',
    { schema: { params: slugParams } },
    async (request, reply) =>
      asClient(request, reply, null, async (connection) => {
        await connection.query('SELECT luminix.client_leave_clinic($1)', [request.params.slug])
        return { ok: true }
      }),
  )

  app.get<{ Params: { slug: string } }>(
    '/client/spaces/:slug/appointments',
    { schema: { params: slugParams } },
    async (request, reply) =>
      asClient(request, reply, request.params.slug, async (connection, scope) => {
        await connection.query('SELECT luminix.expire_deposit_holds($1)', [scope!.clinicId])
        const pix = await spacePix(connection, scope!.clinicId)
        const { rows } = await connection.query(
          `SELECT a.id, a.starts_at, a.ends_at, a.status, a.booking_source, a.price_cents,
                  a.deposit_cents, a.deposit_status, a.deposit_due_at,
                  a.list_price_cents, a.previous_starts_at, a.rescheduled_at, a.updated_at,
                  a.created_at, a.client_payment_method, ${appointmentRentalDates} AS rental_dates,
                  a.cancellation_origin, a.canceled_at, a.online_payment_status, a.online_payment_due_at,
                  CASE WHEN a.cancellation_origin IS NOT NULL THEN a.status_note END AS cancel_reason,
                  s.id AS service_id, s.name AS service_name, s.category AS service_category,
                  p.id AS professional_id, p.display_name AS professional_name,
                  luminix.appointment_paid_cents(a.clinic_id, a.id) AS paid_cents
             FROM luminix.appointments a
             JOIN luminix.services s ON s.clinic_id = a.clinic_id AND s.id = a.service_id
             LEFT JOIN luminix.professionals p ON p.clinic_id = a.clinic_id AND p.id = a.professional_id
            WHERE a.clinic_id = $1 AND a.clinic_client_id = $2
            ORDER BY a.starts_at DESC LIMIT 200`,
          [scope!.clinicId, scope!.clientId],
        )
        const policy = (
          await connection.query(
            `SELECT allow_client_cancellation, cancellation_notice_minutes,
                    rescheduling_notice_minutes, client_instructions
               FROM luminix.booking_policies WHERE clinic_id = $1`,
            [scope!.clinicId],
          )
        ).rows[0]
        const { rows: vouchers } = await connection.query(
          `SELECT id, discount_type, discount_value, expires_on::text, created_at, service_name
             FROM luminix.client_voucher_notices($1, $2)`,
          [scope!.clinicId, scope!.clientId],
        )
        return {
          voucherNotices: vouchers.map((row) => {
            const discount =
              row.discount_type === 'percent'
                ? `${row.discount_value}%`
                : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                    Number(row.discount_value) / 100,
                  )
            if (row.discount_type === 'service')
              return {
                id: `voucher-${row.id}`,
                title: 'Você ganhou um serviço grátis',
                body: `${String(row.service_name ?? 'Um serviço')} por conta do espaço, até ${String(row.expires_on).split('-').reverse().join('/')}. Fale com o espaço para agendar.`,
                at: row.created_at,
              }
            return {
              id: `voucher-${row.id}`,
              title: 'Você recebeu um voucher',
              body: `${discount} de desconto até ${String(row.expires_on).split('-').reverse().join('/')}. Fale com o espaço para usar.`,
              at: row.created_at,
            }
          }),
          timezone,
          policy: {
            allowCancellation: policy?.allow_client_cancellation ?? true,
            cancellationNoticeMinutes: policy?.cancellation_notice_minutes ?? 0,
            reschedulingNoticeMinutes: policy?.rescheduling_notice_minutes ?? null,
            instructions: policy?.client_instructions ?? '',
          },
          appointments: rows.map((row) => ({
            id: row.id,
            start: localDateTime(new Date(String(row.starts_at)), timezone),
            startsAt: row.starts_at,
            endsAt: row.ends_at,
            status: row.status,
            source: row.booking_source,
            priceCents: row.price_cents,
            listPriceCents: row.list_price_cents,
            previousStartsAt: row.previous_starts_at,
            rescheduledAt: row.rescheduled_at,
            updatedAt: row.updated_at,
            createdAt: row.created_at,
            paymentMethod: row.client_payment_method,
            paid: isPaid(row),
            // Paid in the app (ADR-040): awaiting until the due time, then paid or expired.
            onlinePayment: row.online_payment_status
              ? { status: row.online_payment_status, dueAt: row.online_payment_due_at ?? null }
              : null,
            rentalDates: row.rental_dates,
            // The space canceled it because its agenda changed (ADR-035).
            canceledBySpace: row.cancellation_origin === 'schedule_change',
            deposit: depositView(row, pix),
            cancelReason: row.cancel_reason ?? null,
            canceledAt: row.canceled_at ?? null,
            service: { id: row.service_id, name: row.service_name, category: row.service_category },
            professional: row.professional_id
              ? { id: row.professional_id, name: row.professional_name }
              : null,
          })),
        }
      }),
  )

  /** The space's Pix for deposits: key, holder (or the space's name) and city of the address. */
  async function spacePix(connection: SqlConnection, clinicId: string) {
    const row = (
      await connection.query(
        `SELECT b.pix_key, b.pix_key_type, coalesce(b.pix_holder_name, c.name) AS holder,
                coalesce(l.city, '') AS city
           FROM luminix.booking_policies b
           JOIN luminix.clinics c ON c.id = b.clinic_id
           LEFT JOIN luminix.locations l ON l.clinic_id = b.clinic_id AND l.is_primary
          WHERE b.clinic_id = $1`,
        [clinicId],
      )
    ).rows[0]
    if (!row?.pix_key) return null
    return {
      keyType: row.pix_key_type as PixKeyType,
      key: String(row.pix_key),
      holder: String(row.holder),
      city: String(row.city),
    }
  }

  /** Deposit of an appointment as the client sees it; the Pix code only while it is owed. */
  function depositView(row: Record<string, unknown>, pix: Awaited<ReturnType<typeof spacePix>>) {
    if (!row.deposit_status) return null
    const status = String(row.deposit_status)
    const cents = Number(row.deposit_cents)
    const owed = status === 'awaiting' || status === 'reported'
    return {
      cents,
      status,
      dueAt: row.deposit_due_at,
      pix:
        owed && pix
          ? {
              code: pixCopyPaste({
                ...pix,
                amountCents: cents,
                reference: `LX${String(row.id).replace(/-/g, '').slice(0, 10)}`,
              }),
              key: pix.key,
              keyType: pix.keyType,
              holder: pix.holder,
            }
          : null,
    }
  }

  /** Professionals who can do the service for this person, with their photos. */
  async function professionalsFor(connection: SqlConnection, scope: Scope, serviceId: string) {
    const { rows } = await connection.query(
      `SELECT p.id, p.display_name, p.role_name, p.audience, ps.audience AS link_audience,
              photo.large_object_key AS photo_key,
              EXISTS (SELECT 1 FROM luminix.professional_services x
                       WHERE x.clinic_id = $1 AND x.service_id = $2) AS service_has_links,
              ps.professional_id IS NOT NULL AS linked
         FROM luminix.professionals p
         LEFT JOIN luminix.professional_services ps
           ON ps.clinic_id = p.clinic_id AND ps.professional_id = p.id AND ps.service_id = $2
         LEFT JOIN luminix.media_assets photo
           ON photo.clinic_id = p.clinic_id AND photo.id = p.photo_asset_id AND photo.status = 'ready'
        WHERE p.clinic_id = $1 AND p.status = 'active'
        ORDER BY lower(p.display_name), p.id`,
      [scope.clinicId, serviceId],
    )
    const serves = (audience: string | null) =>
      !audience ||
      audience === 'all' ||
      !scope.sex ||
      (audience === 'women' ? scope.sex === 'female' : scope.sex === 'male')
    return rows
      .filter(
        (row) =>
          (!row.service_has_links || row.linked) &&
          serves(row.audience as string | null) &&
          serves(row.link_audience as string | null),
      )
      .map((row) => {
        let photoUrl: string | null = null
        try {
          photoUrl = row.photo_key ? publicMediaUrl(String(row.photo_key)) : null
        } catch {
          photoUrl = null
        }
        return {
          id: String(row.id),
          name: String(row.display_name),
          role: row.role_name ? String(row.role_name) : null,
          photoUrl,
        }
      })
  }

  /** Free start times on one local day, per professional (key "" = the single clinic agenda). */
  async function freeSlots(
    connection: SqlConnection,
    scope: Scope,
    date: string,
    durationMinutes: number,
    professionalIds: string[],
    ignoreAppointmentId: string | null,
    serviceId: string,
  ) {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
    // Unpaid deposit holds whose time ran out free their slot first (ADR-037).
    await connection.query('SELECT luminix.expire_deposit_holds($1)', [scope.clinicId])
    const calendar = await connection.query(
      `SELECT luminix.minute_pairs(luminix.booking_rental_hours($1,$2,
          (SELECT client_package_id FROM luminix.appointments WHERE clinic_id=$1 AND id=$4 AND clinic_client_id=$5 AND service_id=$2),$3::date)) AS windows,
              luminix.exclusive_rental_blocks($1, $2, $3::date) AS reserved`,
      [scope.clinicId, serviceId, date, ignoreAppointmentId, scope.clientId],
    )
    const windows = calendar.rows[0]?.windows as [number, number][] | null
    const rentalPeriods = windows?.map(([start, end]) => ({ start: clock(start), end: clock(end) }))
    const deviceMissing = rentalPeriods?.length === 0
    // Dia exclusivo de locação (ADR-035): only the rented device's treatments are offered.
    const reservedForRental = calendar.rows[0]?.reserved === true
    const [override, weekly, professionalDays, policy, busy, closures, ownDates] =
      await Promise.all([
        connection.query(
          'SELECT is_available, periods FROM luminix.schedule_overrides WHERE clinic_id = $1 AND local_date = $2',
          [scope.clinicId, date],
        ),
        connection.query(
          'SELECT is_available, periods FROM luminix.weekly_availability WHERE clinic_id = $1 AND weekday = $2',
          [scope.clinicId, weekday],
        ),
        connection.query(
          `SELECT professional_id, is_available, periods FROM luminix.professional_weekly_availability
          WHERE clinic_id = $1 AND weekday = $2`,
          [scope.clinicId, weekday],
        ),
        connection.query(
          'SELECT booking_notice_minutes, booking_window_days FROM luminix.booking_policies WHERE clinic_id = $1',
          [scope.clinicId],
        ),
        connection.query(
          `SELECT professional_id, starts_at, ends_at FROM luminix.appointments
          WHERE clinic_id = $1 AND status = ANY($2::text[])
            AND starts_at < ($3::date + 2)::timestamptz AND ends_at > ($3::date - 1)::timestamptz
            AND ($4::uuid IS NULL OR id <> $4::uuid)`,
          [scope.clinicId, active, date, ignoreAppointmentId],
        ),
        // Space closures (férias coletivas, luto…) and each professional's leave.
        connection.query(
          `SELECT professional_id FROM luminix.schedule_closures
          WHERE clinic_id = $1 AND $2::date BETWEEN starts_on AND ends_on`,
          [scope.clinicId, date],
        ),
        // A professional's hours for this date only ("Planejar semanas"), over her week.
        connection.query(
          `SELECT professional_id, is_available, periods FROM luminix.professional_schedule_overrides
          WHERE clinic_id = $1 AND local_date = $2`,
          [scope.clinicId, date],
        ),
      ])
    const spaceClosed = closures.rows.some((row) => row.professional_id == null)
    const away = new Set(
      closures.rows
        .filter((row) => row.professional_id != null)
        .map((row) => String(row.professional_id)),
    )
    const clinicDay = override.rows[0] ?? weekly.rows[0]
    const clinicPeriods = (clinicDay?.is_available ? clinicDay.periods : []) as Period[]
    const notice = Number(policy.rows[0]?.booking_notice_minutes ?? 0)
    const windowDays = Number(policy.rows[0]?.booking_window_days ?? 60)
    const earliest = Date.now() + notice * 60_000
    const today = localDateTime(new Date(), timezone).date
    const last = new Date(Date.parse(`${today}T12:00:00Z`) + windowDays * 86_400_000)
      .toISOString()
      .slice(0, 10)
    const result: Record<string, string[]> = {}
    for (const professionalId of professionalIds) {
      result[professionalId] = []
      if (
        date < today ||
        date > last ||
        spaceClosed ||
        deviceMissing ||
        reservedForRental ||
        away.has(professionalId)
      )
        continue
      const ownDate = ownDates.rows.find((row) => String(row.professional_id) === professionalId)
      const own = professionalDays.rows.find(
        (row) => String(row.professional_id) === professionalId,
      )
      // The professional's week narrows the clinic day; a clinic closure (holiday) closes all.
      // A date of her own always stays inside the space's hours for that day.
      const periods = !professionalId
        ? clinicPeriods
        : ownDate
          ? intersect(clinicPeriods, (ownDate.is_available ? ownDate.periods : []) as Period[])
          : override.rows[0]
            ? own
              ? intersect(clinicPeriods, (own.is_available ? own.periods : []) as Period[])
              : clinicPeriods
            : own
              ? own.is_available
                ? (own.periods as Period[])
                : []
              : clinicPeriods
      const taken = busy.rows.filter(
        (row) => !professionalId || String(row.professional_id) === professionalId,
      )
      for (const period of rentalPeriods ? intersect(periods, rentalPeriods) : periods)
        for (
          let start = minutes(period.start);
          start + durationMinutes <= minutes(period.end);
          start += slotStepMinutes
        ) {
          const startsAt = zonedLocalToUtc(`${date}T${clock(start)}`, timezone)
          if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() < earliest) continue
          const endsAt = startsAt.getTime() + durationMinutes * 60_000
          const clash = taken.some(
            (row) =>
              new Date(String(row.starts_at)).getTime() < endsAt &&
              new Date(String(row.ends_at)).getTime() > startsAt.getTime(),
          )
          if (!clash) result[professionalId].push(clock(start))
        }
    }
    return { slots: result, lastDate: last, deviceMissing }
  }

  async function acceptsInApp(connection: SqlConnection, scope: Scope) {
    const row = (
      await connection.query(
        'SELECT accept_in_app FROM luminix.payment_preferences WHERE clinic_id = $1',
        [scope.clinicId],
      )
    ).rows[0]
    return row?.accept_in_app === true
  }

  /** A rented device linked to the service (its rental days open the client agenda). */
  async function hasDevice(connection: SqlConnection, scope: Scope, serviceId: string) {
    const result = await connection.query(
      `SELECT 1 FROM luminix.service_resources sr
         JOIN luminix.resources r ON r.clinic_id = sr.clinic_id AND r.id = sr.resource_id
        WHERE sr.clinic_id = $1 AND sr.service_id = $2 AND r.type = 'equipment'
          AND r.status = 'active' LIMIT 1`,
      [scope.clinicId, serviceId],
    )
    return result.rows.length > 0
  }

  async function serviceFor(connection: SqlConnection, scope: Scope, serviceId: string) {
    return (
      await connection.query(
        `SELECT id, name, duration_minutes, booking_mode, price_type FROM luminix.services
          WHERE clinic_id = $1 AND id = $2 AND status = 'active'`,
        [scope.clinicId, serviceId],
      )
    ).rows[0]
  }

  app.get<{
    Params: { slug: string }
    Querystring: { serviceId: string; date: string; ignore?: string }
  }>(
    '/client/spaces/:slug/availability',
    {
      schema: {
        params: slugParams,
        querystring: {
          type: 'object',
          additionalProperties: false,
          required: ['serviceId', 'date'],
          properties: {
            serviceId: { type: 'string', pattern: uuid },
            date: { type: 'string', pattern: ymd },
            ignore: { type: 'string', pattern: uuid },
          },
        },
      },
    },
    async (request, reply) =>
      asClient(request, reply, request.params.slug, async (connection, scope) => {
        const service = await serviceFor(connection, scope!, request.query.serviceId)
        if (
          !service ||
          (service.booking_mode === 'manual_release' &&
            !(await hasDevice(connection, scope!, String(service.id))))
        )
          return reply.code(404).send({ error: 'Service unavailable' })
        const moving = request.query.ignore
          ? (
              await connection.query(
                `SELECT extract(epoch FROM (ends_at - starts_at))/60 AS duration FROM luminix.appointments
            WHERE clinic_id=$1 AND clinic_client_id=$2 AND service_id=$3 AND id=$4`,
                [scope!.clinicId, scope!.clientId, service.id, request.query.ignore],
              )
            ).rows[0]
          : null
        if (request.query.ignore && !moving)
          return reply.code(404).send({ error: 'Appointment not found' })
        const durationMinutes = Number(moving?.duration ?? service.duration_minutes)
        const professionals = await professionalsFor(connection, scope!, String(service.id))
        const { slots, lastDate } = await freeSlots(
          connection,
          scope!,
          request.query.date,
          durationMinutes,
          professionals.length ? professionals.map((item) => item.id) : [''],
          request.query.ignore ?? null,
          String(service.id),
        )
        return {
          date: request.query.date,
          lastDate,
          durationMinutes,
          bookingMode: service.booking_mode,
          // 0 or 1 professional: the agenda is chosen for the client, no picker.
          choose: professionals.length > 1,
          // Pix/card only when the space turned on payments in the app.
          // Switch on AND account approved (ADR-041), so the client never picks a dead option.
          inAppPayments:
            (
              await connection.query('SELECT luminix.clinic_online_ready($1) AS ready', [
                scope!.clinicId,
              ])
            ).rows[0]?.ready === true,
          professionals,
          slots,
        }
      }),
  )

  app.post<{
    Params: { slug: string }
    Body: {
      serviceId: string
      professionalId?: string
      localStartsAt: string
      paymentMethod: 'local' | 'pix' | 'card'
      /** The app shows the space's Pix code for the deposit (ADR-037). */
      deposit?: 'pix'
    }
  }>(
    '/client/spaces/:slug/appointments',
    {
      bodyLimit: 2048,
      schema: {
        params: slugParams,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['serviceId', 'localStartsAt', 'paymentMethod'],
          properties: {
            serviceId: { type: 'string', pattern: uuid },
            professionalId: { type: 'string', pattern: uuid },
            localStartsAt: { type: 'string', pattern: localStart },
            paymentMethod: { type: 'string', enum: ['local', 'pix', 'card'] },
            deposit: { type: 'string', enum: ['pix'] },
          },
        },
      },
    },
    async (request, reply) => {
      const online = request.body.paymentMethod !== 'local'
      let account: string | null = null
      const provider = online ? payments() : null
      if (online) {
        // 1) Before holding a slot: the space must have a ready Stripe account (outside SQL).
        if (!provider) return reply.code(503).send({ error: 'Payment unavailable' })
        let connect
        let context
        try {
          connect = dependencies.connectProvider ?? createConnectProvider()
          context = await connect.context()
        } catch {
          return reply.code(503).send({ error: 'Payment unavailable' })
        }
        const found = (await asClient(
          request,
          reply,
          request.params.slug,
          async (connection, scope) =>
            (
              await connection.query(
                'SELECT luminix.clinic_online_account($1, $2, $3) AS account',
                [scope!.clinicId, context.platformAccountId, context.livemode],
              )
            ).rows[0]?.account ?? null,
        )) as string | null
        if (reply.sent) return found
        if (!found) return reply.code(409).send({ error: 'Payment unavailable' })
        account = found
        try {
          if (!connectReady(await connect.status(account)))
            return reply.code(409).send({ error: 'Payment unavailable' })
        } catch {
          return reply.code(503).send({ error: 'Payment unavailable' })
        }
      }
      // 2) Book (and hold, when paying in the app) in one short transaction.
      const booked = (await asClient(
        request,
        reply,
        request.params.slug,
        async (connection, scope) => {
          // Space without a valid plan (ADR-039): its page stays up, new bookings pause.
          const access = await connection.query(
            "SELECT luminix.clinic_access_state($1::uuid)->>'state' AS state",
            [scope!.clinicId],
          )
          if (access.rows[0]?.state === 'read_only')
            return reply.code(409).send({ error: 'Booking paused' })
          if (scope!.recordProblem) return reply.code(409).send({ error: scope!.recordProblem })
          if (request.body.paymentMethod !== 'local' && !(await acceptsInApp(connection, scope!)))
            return reply.code(400).send({ error: 'Payment unavailable' })
          const service = await serviceFor(connection, scope!, request.body.serviceId)
          if (!service) return reply.code(400).send({ error: 'Service unavailable' })
          const needsDeposit =
            (
              await connection.query('SELECT luminix.service_requires_deposit($1, $2) AS needed', [
                scope!.clinicId,
                service.id,
              ])
            ).rows[0]?.needed === true
          // An app that cannot show the Pix code must not hold a slot the client cannot pay.
          // Paying the full price in the app covers the deposit.
          if (needsDeposit && !online && request.body.deposit !== 'pix')
            return reply.code(409).send({ error: 'Deposit required' })
          // "A combinar" and "a partir de": the clinic sets the amount at the visit, so these are
          // paid only at the clinic (no in-app charge of an amount that is not known yet).
          if (request.body.paymentMethod !== 'local' && service.price_type !== 'fixed')
            return reply.code(400).send({ error: 'Pay at the clinic' })
          const professionals = await professionalsFor(connection, scope!, String(service.id))
          const date = request.body.localStartsAt.slice(0, 10)
          const time = request.body.localStartsAt.slice(11)
          // Without a choice (or with one professional) the first free agenda takes the booking.
          const candidates = !professionals.length
            ? ['']
            : request.body.professionalId
              ? professionals.some((item) => item.id === request.body.professionalId)
                ? [request.body.professionalId]
                : []
              : professionals.map((item) => item.id)
          if (!candidates.length) return reply.code(400).send({ error: 'Professional unavailable' })
          const { slots, deviceMissing } = await freeSlots(
            connection,
            scope!,
            date,
            Number(service.duration_minutes),
            candidates,
            null,
            String(service.id),
          )
          if (deviceMissing) return reply.code(409).send({ error: 'Service unavailable' })
          const professionalId = candidates.find((id) => slots[id]?.includes(time))
          if (professionalId === undefined) return reply.code(409).send({ error: 'Slot taken' })
          const startsAt = zonedLocalToUtc(request.body.localStartsAt, timezone)
          const endsAt = new Date(startsAt.getTime() + Number(service.duration_minutes) * 60_000)
          const id = (
            await connection.query(
              'SELECT luminix.client_book_appointment($1, $2, $3, $4, $5, $6, $7) AS id',
              [
                scope!.clinicId,
                scope!.clientId,
                service.id,
                professionalId || null,
                startsAt.toISOString(),
                endsAt.toISOString(),
                request.body.paymentMethod,
              ],
            )
          ).rows[0]?.id
          if (online) {
            const hold = (
              await connection.query(
                'SELECT * FROM luminix.client_hold_for_online_payment($1, $2, $3, 35)',
                [scope!.clinicId, scope!.clientId, id],
              )
            ).rows[0]
            return {
              online: {
                id: String(id),
                clinicId: scope!.clinicId,
                clientId: scope!.clientId,
                amount: Number(hold.amount_cents),
                dueAt: new Date(String(hold.due_at)),
                service: String(service.name),
                clinicName: String(
                  (
                    await connection.query('SELECT name FROM luminix.clinics WHERE id = $1', [
                      scope!.clinicId,
                    ])
                  ).rows[0]?.name ?? '',
                ),
              },
            }
          }
          if (needsDeposit) {
            const hold = (
              await connection.query('SELECT * FROM luminix.client_hold_for_deposit($1, $2, $3)', [
                scope!.clinicId,
                scope!.clientId,
                id,
              ])
            ).rows[0]
            if (hold) {
              const pix = await spacePix(connection, scope!.clinicId)
              return reply.code(201).send({
                id,
                status: 'scheduled',
                deposit: depositView(
                  {
                    id,
                    deposit_cents: hold.deposit_cents,
                    deposit_status: 'awaiting',
                    deposit_due_at: hold.deposit_due_at,
                  },
                  pix,
                ),
              })
            }
          }
          return reply.code(201).send({
            id,
            status: service.booking_mode === 'instant' ? 'confirmed' : 'scheduled',
            deposit: null,
          })
        },
      )) as
        | {
            online?: {
              id: string
              clinicId: string
              clientId: string
              amount: number
              dueAt: Date
              service: string
              clinicName: string
            }
          }
        | undefined
      if (reply.sent || !booked?.online || !provider || !account) return booked
      const hold = booked.online
      const release = () =>
        asClient(request, reply, request.params.slug, async (connection, scope) => {
          await connection.query('SELECT luminix.client_release_online_hold($1, $2, $3)', [
            scope!.clinicId,
            scope!.clientId,
            hold.id,
          ])
          return true
        })
      const returnUrl = paymentReturnUrl()
      // Stripe needs at least 30 minutes to pay; a visit sooner than that is paid at the space.
      if (!returnUrl || hold.dueAt.getTime() - Date.now() < 31 * 60_000) {
        await release()
        if (reply.sent) return
        return reply
          .code(409)
          .send({ error: returnUrl ? 'Pay at the clinic' : 'Payment unavailable' })
      }
      // 3) Stripe outside any transaction, on the clinic's own account.
      let checkout
      try {
        checkout = await provider.createCheckout({
          account,
          appointmentId: hold.id,
          clinicId: hold.clinicId,
          method: request.body.paymentMethod as 'pix' | 'card',
          amountCents: hold.amount,
          description: hold.service,
          businessName: hold.clinicName,
          email: null,
          expiresAt: hold.dueAt,
          returnUrl,
        })
      } catch (error) {
        await release()
        if (reply.sent) return
        if (error instanceof PixUnavailableError)
          return reply.code(409).send({ error: 'Pix unavailable' })
        request.log.warn({ event: 'online_payment_checkout_failed' })
        return reply.code(503).send({ error: 'Payment unavailable' })
      }
      // 4) Record the session; the webhook confirms the payment later.
      const saved = await asClient(
        request,
        reply,
        request.params.slug,
        async (connection, scope) => {
          await connection.query(
            'SELECT luminix.client_open_online_payment($1, $2, $3, $4, $5, $6, $7)',
            [
              scope!.clinicId,
              scope!.clientId,
              hold.id,
              account,
              checkout.id,
              request.body.paymentMethod,
              hold.amount,
            ],
          )
          return true
        },
      )
      if (reply.sent) return saved
      return reply.code(201).send({
        id: hold.id,
        status: 'scheduled',
        deposit: null,
        payment: {
          method: request.body.paymentMethod,
          amountCents: hold.amount,
          dueAt: hold.dueAt.toISOString(),
          url: checkout.url,
        },
      })
    },
  )

  // Back to an unfinished payment (the client closed the Stripe page): the open session URL.
  app.post<{ Params: { slug: string; appointmentId: string } }>(
    '/client/spaces/:slug/appointments/:appointmentId/payment',
    { schema: { params: appointmentParams } },
    async (request, reply) => {
      const provider = payments()
      if (!provider) return reply.code(503).send({ error: 'Payment unavailable' })
      const open = (await asClient(
        request,
        reply,
        request.params.slug,
        async (connection, scope) => {
          await connection.query('SELECT luminix.expire_deposit_holds($1)', [scope!.clinicId])
          return (
            (
              await connection.query(
                `SELECT p.account_id, p.session_id
               FROM luminix.online_payments p
               JOIN luminix.appointments a ON a.clinic_id = p.clinic_id AND a.id = p.appointment_id
              WHERE p.clinic_id = $1 AND p.appointment_id = $2 AND a.clinic_client_id = $3
                AND p.status = 'open' AND a.online_payment_status = 'awaiting'
              ORDER BY p.created_at DESC LIMIT 1`,
                [scope!.clinicId, request.params.appointmentId, scope!.clientId],
              )
            ).rows[0] ?? null
          )
        },
      )) as { account_id: string; session_id: string } | null
      if (reply.sent) return open
      if (!open) return reply.code(409).send({ error: 'Payment closed' })
      try {
        const url = await provider.openUrl(String(open.account_id), String(open.session_id))
        if (!url) return reply.code(409).send({ error: 'Payment closed' })
        return { url }
      } catch {
        return reply.code(503).send({ error: 'Payment unavailable' })
      }
    },
  )

  // "Já paguei": the hold stops expiring and the space confirms after checking the bank.
  app.post<{ Params: { slug: string; appointmentId: string } }>(
    '/client/spaces/:slug/appointments/:appointmentId/deposit-paid',
    { schema: { params: appointmentParams } },
    async (request, reply) =>
      asClient(request, reply, request.params.slug, async (connection, scope) => {
        await connection.query('SELECT luminix.client_report_deposit($1, $2, $3)', [
          scope!.clinicId,
          scope!.clientId,
          request.params.appointmentId,
        ])
        return { ok: true }
      }),
  )

  app.post<{ Params: { slug: string; appointmentId: string } }>(
    '/client/spaces/:slug/appointments/:appointmentId/cancel',
    { schema: { params: appointmentParams } },
    async (request, reply) => {
      const canceled = (await asClient(
        request,
        reply,
        request.params.slug,
        async (connection, scope) => {
          await connection.query('SELECT luminix.client_cancel_appointment($1, $2, $3)', [
            scope!.clinicId,
            scope!.clientId,
            request.params.appointmentId,
          ])
          return { clinicId: scope!.clinicId }
        },
      )) as { clinicId: string } | undefined
      if (reply.sent || !canceled) return canceled
      // Paid in the app (ADR-040): canceling within the deadline gives the full amount back.
      const refunded = await refundDue(
        dependencies.database,
        payments(),
        canceled.clinicId,
        request.log,
      )
      return { ok: true, refunded: refunded > 0 }
    },
  )

  app.post<{ Params: { slug: string; appointmentId: string }; Body: { localStartsAt: string } }>(
    '/client/spaces/:slug/appointments/:appointmentId/reschedule',
    {
      bodyLimit: 1024,
      schema: {
        params: appointmentParams,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['localStartsAt'],
          properties: { localStartsAt: { type: 'string', pattern: localStart } },
        },
      },
    },
    async (request, reply) =>
      asClient(request, reply, request.params.slug, async (connection, scope) => {
        const current = (
          await connection.query(
            `SELECT a.professional_id, a.service_id, extract(epoch FROM (a.ends_at - a.starts_at))/60 AS duration_minutes FROM luminix.appointments a
              WHERE a.clinic_id = $1 AND a.id = $2 AND a.clinic_client_id = $3`,
            [scope!.clinicId, request.params.appointmentId, scope!.clientId],
          )
        ).rows[0]
        if (!current) return reply.code(404).send({ error: 'Appointment not found' })
        const date = request.body.localStartsAt.slice(0, 10)
        const agenda = current.professional_id ? String(current.professional_id) : ''
        const { slots, deviceMissing } = await freeSlots(
          connection,
          scope!,
          date,
          Number(current.duration_minutes),
          [agenda],
          request.params.appointmentId,
          String(current.service_id),
        )
        if (deviceMissing) return reply.code(409).send({ error: 'Service unavailable' })
        if (!slots[agenda]?.includes(request.body.localStartsAt.slice(11)))
          return reply.code(409).send({ error: 'Slot taken' })
        const startsAt = zonedLocalToUtc(request.body.localStartsAt, timezone)
        const endsAt = new Date(startsAt.getTime() + Number(current.duration_minutes) * 60_000)
        await connection.query('SELECT luminix.client_reschedule_appointment($1, $2, $3, $4, $5)', [
          scope!.clinicId,
          scope!.clientId,
          request.params.appointmentId,
          startsAt.toISOString(),
          endsAt.toISOString(),
        ])
        return { ok: true }
      }),
  )
}
