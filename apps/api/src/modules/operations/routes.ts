import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { SqlConnection } from '../../shared/database/migrations.js'
import { withClinicTransaction, type TenantPool } from '../../shared/tenant/clinic-transaction.js'
import type { TenantContext } from '../../shared/tenant/tenant-context.js'

type Period = { start: string; end: string }
type WarningCode = 'past' | 'outside_availability' | 'overlap'

const uuid = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
const time = '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
const ymd = '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
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

function localDateTime(value: Date, timezone: string) {
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

function zonedLocalToUtc(value: string, timezone: string): Date {
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
) {
  const clinicParams = {
    type: 'object',
    additionalProperties: false,
    required: ['clinicId'],
    properties: { clinicId: { type: 'string', pattern: uuid } },
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
      )
    } catch (error) {
      const code = (error as { code?: string }).code
      if ((error as { statusCode?: number }).statusCode === 403)
        return reply.code(403).send({ error: 'Clinic access denied' })
      if (code === '23503') return reply.code(400).send({ error: 'Invalid clinic resource' })
      if (code === '23505') return reply.code(409).send({ error: 'Record already exists' })
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
                  c.notes, c.status, c.created_at,
                  count(a.id)::integer AS appointment_count,
                  max(a.starts_at) FILTER (WHERE a.status IN ('confirmed','completed')) AS last_visit_at
             FROM luminix.clinic_clients c
             LEFT JOIN luminix.appointments a
               ON a.clinic_id = c.clinic_id AND a.clinic_client_id = c.id
            WHERE c.clinic_id = $1
              AND ($2 = 'all' OR c.status = $2)
              AND ($3 = '' OR c.display_name ILIKE '%' || $3 || '%'
                OR coalesce(c.contact_phone, '') ILIKE '%' || $3 || '%'
                OR coalesce(c.contact_email, '') ILIKE '%' || $3 || '%')
            GROUP BY c.id
            ORDER BY lower(c.display_name), c.id
            LIMIT 200`,
          [tenant.clinicId, status, query],
        )
        return { clients: result.rows }
      }),
  )

  app.post<{
    Params: { clinicId: string }
    Body: { name: string; phone?: string; email?: string; birthDate?: string; notes?: string }
  }>(
    '/clinics/:clinicId/clients',
    {
      bodyLimit: 8192,
      schema: {
        params: clinicParams,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 160, pattern: '\\S' },
            phone: { type: 'string', maxLength: 16, pattern: '^$|^\\+[1-9][0-9]{7,14}$' },
            email: { type: 'string', maxLength: 254 },
            birthDate: { type: 'string', pattern: `^$|${ymd.slice(1, -1)}$` },
            notes: { type: 'string', maxLength: 4000 },
          },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'client:manage', async (connection, tenant) => {
        const email = request.body.email?.trim().toLowerCase() || null
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
          return reply.code(400).send({ error: 'Invalid email' })
        const result = await connection.query(
          `SELECT id, display_name, contact_phone, contact_email, birth_date, notes, status, created_at
             FROM luminix.create_clinic_client($1, $2, $3, $4, $5, $6)`,
          [
            tenant.clinicId,
            request.body.name.trim(),
            request.body.phone?.trim() || null,
            email,
            request.body.birthDate || null,
            request.body.notes?.trim() || null,
          ],
        )
        return reply.code(201).send({ client: result.rows[0] })
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
      authorized(request, reply, 'clinic:manage', async (connection, tenant) => {
        const from = new Date(request.query.from)
        const to = new Date(request.query.to)
        if (!(to > from) || to.getTime() - from.getTime() > 63 * 86400000)
          return reply.code(400).send({ error: 'Invalid date range' })
        const [appointments, clients, services, professionals, weekly, overrides, settings] =
          await Promise.all([
            connection.query(
              `SELECT a.id, a.starts_at, a.ends_at, a.status, a.booking_source,
                      a.override_reasons, a.notes, c.id AS client_id,
                      c.display_name AS client_name, s.id AS service_id, s.name AS service_name,
                      s.duration_minutes, p.id AS professional_id, p.display_name AS professional_name
                 FROM luminix.appointments a
                 JOIN luminix.clinic_clients c ON c.clinic_id = a.clinic_id AND c.id = a.clinic_client_id
                 JOIN luminix.services s ON s.clinic_id = a.clinic_id AND s.id = a.service_id
                 LEFT JOIN luminix.professionals p ON p.clinic_id = a.clinic_id AND p.id = a.professional_id
                WHERE a.clinic_id = $1 AND a.starts_at < $3 AND a.ends_at > $2
                  AND a.status <> 'canceled'
                ORDER BY a.starts_at, a.id`,
              [tenant.clinicId, from.toISOString(), to.toISOString()],
            ),
            connection.query(
              `SELECT id, display_name FROM luminix.clinic_clients
                WHERE clinic_id = $1 AND status = 'active' ORDER BY lower(display_name) LIMIT 500`,
              [tenant.clinicId],
            ),
            connection.query(
              `SELECT id, name, duration_minutes FROM luminix.services
                WHERE clinic_id = $1 AND status = 'active' ORDER BY lower(name) LIMIT 200`,
              [tenant.clinicId],
            ),
            connection.query(
              `SELECT id, display_name FROM luminix.professionals
                WHERE clinic_id = $1 AND status = 'active' ORDER BY lower(display_name) LIMIT 100`,
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
          ])
        return {
          appointments: appointments.rows,
          clients: clients.rows,
          services: services.rows,
          professionals: professionals.rows,
          weeklyAvailability: weekly.rows,
          overrides: overrides.rows,
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
            localStartsAt: {
              type: 'string',
              pattern: '^\\d{4}-\\d{2}-\\d{2}T(?:[01][0-9]|2[0-3]):[0-5][0-9]$',
            },
            notes: { type: 'string', maxLength: 4000 },
            confirmedWarnings: {
              type: 'array',
              uniqueItems: true,
              items: { type: 'string', enum: ['past', 'outside_availability', 'overlap'] },
            },
          },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'clinic:manage', async (connection, tenant) => {
        const service = (
          await connection.query(
            `SELECT id, name, duration_minutes FROM luminix.services
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
        const endsAt = new Date(startsAt.getTime() + Number(service.duration_minutes) * 60000)
        const local = localDateTime(startsAt, timezone)
        const override = (
          await connection.query(
            `SELECT is_available, periods FROM luminix.schedule_overrides
              WHERE clinic_id = $1 AND local_date = $2`,
            [tenant.clinicId, local.date],
          )
        ).rows[0]
        const weekly = override
          ? null
          : (
              await connection.query(
                `SELECT is_available, periods FROM luminix.weekly_availability
                  WHERE clinic_id = $1 AND weekday = $2`,
                [tenant.clinicId, local.weekday],
              )
            ).rows[0]
        const availability = override ?? weekly
        const periods = (availability?.periods ?? []) as Period[]
        const overlap = await connection.query(
          `SELECT id FROM luminix.appointments
            WHERE clinic_id = $1 AND status = ANY($2::text[])
              AND starts_at < $4 AND ends_at > $3
              AND ($5::uuid IS NULL OR professional_id = $5::uuid)
            LIMIT 5`,
          [
            tenant.clinicId,
            activeAppointmentStatuses,
            startsAt.toISOString(),
            endsAt.toISOString(),
            request.body.professionalId ?? null,
          ],
        )
        const warnings: Array<{ code: WarningCode; title: string; detail: string }> = []
        if (startsAt.getTime() < Date.now())
          warnings.push({
            code: 'past',
            title: 'Horário no passado',
            detail: 'O atendimento ficará registrado em um horário que já passou.',
          })
        if (!availability?.is_available || !fitsPeriod(startsAt, endsAt, timezone, periods))
          warnings.push({
            code: 'outside_availability',
            title: 'Fora do horário disponível',
            detail: 'Clientes não poderiam escolher este horário, mas o gestor pode prosseguir.',
          })
        if (overlap.rows.length)
          warnings.push({
            code: 'overlap',
            title: 'Conflito de agenda',
            detail: `Há ${overlap.rows.length} atendimento(s) ocupando parte deste horário.`,
          })
        const confirmed = new Set(request.body.confirmedWarnings ?? [])
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
        return reply.code(201).send({ appointment: result.rows[0], warnings })
      }),
  )

  app.put<{
    Params: { clinicId: string }
    Body:
      | {
          mode: 'weekly'
          days: Array<{ weekday: number; isAvailable: boolean; periods: Period[] }>
        }
      | {
          mode: 'override'
          date: string
          useDefault?: boolean
          isAvailable?: boolean
          periods?: Period[]
          reason?: string
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
      authorized(request, reply, 'clinic:manage', async (connection, tenant) => {
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
          return { availability: request.body.days }
        }
        if (request.body.useDefault) {
          await connection.query(
            'SELECT luminix.save_schedule_override($1, $2::date, true, false, $3::jsonb, null)',
            [tenant.clinicId, request.body.date, JSON.stringify([])],
          )
          return { override: null }
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
        return {
          override: {
            local_date: request.body.date,
            is_available: isAvailable,
            periods,
            reason: request.body.reason?.trim() || null,
          },
        }
      }),
  )
}
