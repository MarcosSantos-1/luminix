import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { SqlConnection } from '../../shared/database/migrations.js'
import { createStaffAuthenticator, type AuthDependencies } from '../../shared/auth/staff-session.js'
import type { TenantPool } from '../../shared/tenant/clinic-transaction.js'
import { publicMediaUrl } from '../clinics/media-storage.js'
import { isPaid } from '../../shared/tenant/route-helpers.js'
import { localDateTime, zonedLocalToUtc } from '../operations/routes.js'

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
  if (message.includes('Cancellation closed')) return { status: 409, error: 'Cancellation closed' }
  if (message.includes('Rescheduling closed')) return { status: 409, error: 'Rescheduling closed' }
  if (code === '42501') return { status: 403, error: 'Access denied' }
  if (code === '22023' || code === '23514' || code === '22P02')
    return { status: 400, error: 'Invalid request' }
  return null
}

export async function clientRoutes(app: FastifyInstance, dependencies: AuthDependencies) {
  // Own counter, more generous than the staff one: browsing days and times is many small reads.
  const authenticate = createStaffAuthenticator(dependencies, 120)
  const pool: TenantPool | undefined = dependencies.tenantPool
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
        const { rows } = await connection.query(
          `SELECT a.id, a.starts_at, a.ends_at, a.status, a.booking_source, a.price_cents,
                  a.list_price_cents, a.previous_starts_at, a.rescheduled_at, a.updated_at,
                  a.created_at, a.client_payment_method,
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
        return {
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
            service: { id: row.service_id, name: row.service_name, category: row.service_category },
            professional: row.professional_id
              ? { id: row.professional_id, name: row.professional_name }
              : null,
          })),
        }
      }),
  )

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
    // A service that depends on a device (manual_release) is only bookable on its rental days;
    // without a linked device it stays off the client agenda, as before.
    const device = (
      await connection.query(
        `SELECT s.booking_mode = 'manual_release' AS needs,
                EXISTS (SELECT 1 FROM luminix.service_resources sr
                          JOIN luminix.resources r ON r.clinic_id = sr.clinic_id AND r.id = sr.resource_id
                          JOIN luminix.resource_rentals rr ON rr.clinic_id = r.clinic_id AND rr.resource_id = r.id
                         WHERE sr.clinic_id = s.clinic_id AND sr.service_id = s.id
                           AND r.type = 'equipment' AND r.status = 'active'
                           AND $3::date BETWEEN rr.starts_on AND rr.ends_on) AS rented
           FROM luminix.services s WHERE s.clinic_id = $1 AND s.id = $2`,
        [scope.clinicId, serviceId, date],
      )
    ).rows[0]
    const deviceMissing = device?.needs === true && device.rented !== true
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
      if (date < today || date > last || spaceClosed || deviceMissing || away.has(professionalId))
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
      for (const period of periods)
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
    return { slots: result, lastDate: last }
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
        `SELECT id, name, duration_minutes, booking_mode FROM luminix.services
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
        const professionals = await professionalsFor(connection, scope!, String(service.id))
        const { slots, lastDate } = await freeSlots(
          connection,
          scope!,
          request.query.date,
          Number(service.duration_minutes),
          professionals.length ? professionals.map((item) => item.id) : [''],
          request.query.ignore ?? null,
          String(service.id),
        )
        return {
          date: request.query.date,
          lastDate,
          durationMinutes: Number(service.duration_minutes),
          bookingMode: service.booking_mode,
          // 0 or 1 professional: the agenda is chosen for the client, no picker.
          choose: professionals.length > 1,
          // Pix/card only when the space turned on payments in the app.
          inAppPayments: await acceptsInApp(connection, scope!),
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
          },
        },
      },
    },
    async (request, reply) =>
      asClient(request, reply, request.params.slug, async (connection, scope) => {
        if (scope!.recordProblem) return reply.code(409).send({ error: scope!.recordProblem })
        if (request.body.paymentMethod !== 'local' && !(await acceptsInApp(connection, scope!)))
          return reply.code(400).send({ error: 'Payment unavailable' })
        const service = await serviceFor(connection, scope!, request.body.serviceId)
        if (!service) return reply.code(400).send({ error: 'Service unavailable' })
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
        const { slots } = await freeSlots(
          connection,
          scope!,
          date,
          Number(service.duration_minutes),
          candidates,
          null,
          String(service.id),
        )
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
        return reply.code(201).send({
          id,
          status: service.booking_mode === 'instant' ? 'confirmed' : 'scheduled',
        })
      }),
  )

  app.post<{ Params: { slug: string; appointmentId: string } }>(
    '/client/spaces/:slug/appointments/:appointmentId/cancel',
    { schema: { params: appointmentParams } },
    async (request, reply) =>
      asClient(request, reply, request.params.slug, async (connection, scope) => {
        await connection.query('SELECT luminix.client_cancel_appointment($1, $2, $3)', [
          scope!.clinicId,
          scope!.clientId,
          request.params.appointmentId,
        ])
        return { ok: true }
      }),
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
            `SELECT a.professional_id, a.service_id, s.duration_minutes FROM luminix.appointments a
               JOIN luminix.services s ON s.clinic_id = a.clinic_id AND s.id = a.service_id
              WHERE a.clinic_id = $1 AND a.id = $2 AND a.clinic_client_id = $3`,
            [scope!.clinicId, request.params.appointmentId, scope!.clientId],
          )
        ).rows[0]
        if (!current) return reply.code(404).send({ error: 'Appointment not found' })
        const date = request.body.localStartsAt.slice(0, 10)
        const agenda = current.professional_id ? String(current.professional_id) : ''
        const { slots } = await freeSlots(
          connection,
          scope!,
          date,
          Number(current.duration_minutes),
          [agenda],
          request.params.appointmentId,
          String(current.service_id),
        )
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
