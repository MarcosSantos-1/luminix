import type { FastifyInstance } from 'fastify'
import type { AuthDependencies } from '../../shared/auth/staff-session.js'
import {
  clinicRefParams,
  createAuthorizedRoute,
  type Authenticate,
} from '../../shared/tenant/authorized-route.js'
import { withClinicTransaction } from '../../shared/tenant/clinic-transaction.js'
import { publicMediaUrl } from '../clinics/media-storage.js'
import { accessMail, accessMailFailure } from './access-mail.js'
import {
  confirmCancellationsSchema,
  fittingAppointments,
  settleScheduleImpact,
  withCancellationMail,
} from '../operations/schedule-impact.js'

const uuidPattern = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
const clock = { type: 'string', pattern: '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' }
const itemParams = (name: string) => ({
  type: 'object',
  additionalProperties: false,
  required: ['clinicId', name],
  properties: { ...clinicRefParams.properties, [name]: { type: 'string', pattern: uuidPattern } },
})
const accessRoles = ['manager', 'team'] as const

type Day = { weekday: number; enabled: boolean; start: string; end: string; breaks: Period[] }
type Period = { start: string; end: string }

/** Rebuilds the editable day from stored periods when no onboarding snapshot exists. */
function dayFromPeriods(weekday: number, available: boolean, periods: Period[]): Day {
  if (!available || !periods.length)
    return { weekday, enabled: false, start: '09:00', end: '18:00', breaks: [] }
  const sorted = [...periods].sort((a, b) => a.start.localeCompare(b.start))
  return {
    weekday,
    enabled: true,
    start: sorted[0].start,
    end: sorted.at(-1)!.end,
    breaks: sorted
      .slice(1)
      .map((period, index) => ({ start: sorted[index].end, end: period.start })),
  }
}

/**
 * Team (professionals who attend) and access (who signs in). They are separate on purpose:
 * a receptionist has a login but no agenda; a professional may attend without a login; the
 * owner who also attends links her own login to a professional record.
 */
export async function teamRoutes(
  app: FastifyInstance,
  authenticate: Authenticate,
  dependencies: AuthDependencies,
) {
  const authorized = createAuthorizedRoute(authenticate, dependencies.tenantPool)
  const mail = { mailer: dependencies.mailer, adminOrigin: dependencies.adminOrigin }

  app.get<{ Params: { clinicId: string } }>(
    '/clinics/:clinicId/team',
    { schema: { params: clinicRefParams } },
    async (request, reply) =>
      authorized(request, reply, 'professional:manage', async (connection, tenant) => {
        const [people, links, days, services, hours] = await Promise.all([
          connection.query(
            `SELECT p.id, p.display_name, p.role_name, p.gender, p.audience, p.membership_id,
                    p.photo_asset_id, photo.large_object_key AS photo_key
               FROM luminix.professionals p
               LEFT JOIN luminix.media_assets photo ON photo.clinic_id = p.clinic_id
                 AND photo.id = p.photo_asset_id AND photo.status = 'ready'
              WHERE p.clinic_id = $1 AND p.status = 'active'
              ORDER BY p.created_at, p.id LIMIT 60`,
            [tenant.clinicId],
          ),
          connection.query(
            `SELECT professional_id, service_id, audience FROM luminix.professional_services
              WHERE clinic_id = $1`,
            [tenant.clinicId],
          ),
          connection.query(
            `SELECT professional_id, weekday, is_available, periods, day_schedule
               FROM luminix.professional_weekly_availability WHERE clinic_id = $1`,
            [tenant.clinicId],
          ),
          connection.query(
            `SELECT id, name, coalesce(category, 'Cuidados') AS category, is_sensitive, audience
               FROM luminix.services WHERE clinic_id = $1 AND status = 'active'
              ORDER BY category, name, id LIMIT 80`,
            [tenant.clinicId],
          ),
          connection.query(
            `SELECT weekday, is_available, periods FROM luminix.weekly_availability
              WHERE clinic_id = $1 ORDER BY weekday`,
            [tenant.clinicId],
          ),
        ])
        const clinicHours = [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
          const row = hours.rows.find((item) => Number(item.weekday) === weekday)
          return dayFromPeriods(
            weekday,
            row?.is_available === true,
            (row?.periods ?? []) as Period[],
          )
        })
        return {
          selfMembershipId: tenant.membershipId,
          clinicHours,
          services: services.rows.map((service) => ({
            id: String(service.id),
            name: String(service.name),
            category: String(service.category),
            sensitive: service.is_sensitive === true,
            audience: service.audience,
          })),
          professionals: people.rows.map((person) => {
            const id = String(person.id)
            const own = links.rows.filter((link) => String(link.professional_id) === id)
            return {
              id,
              name: String(person.display_name),
              role: person.role_name ? String(person.role_name) : '',
              gender: person.gender ?? 'female',
              audience: person.audience ?? 'all',
              membershipId: person.membership_id ? String(person.membership_id) : null,
              photoAssetId: person.photo_key ? String(person.photo_asset_id) : '',
              photoUrl: person.photo_key ? publicMediaUrl(String(person.photo_key)) : null,
              serviceIds: own.map((link) => String(link.service_id)),
              serviceAudiences: Object.fromEntries(
                own
                  .filter((link) => link.audience)
                  .map((link) => [String(link.service_id), link.audience]),
              ),
              days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
                const row = days.rows.find(
                  (item) => String(item.professional_id) === id && Number(item.weekday) === weekday,
                )
                const snapshot = row?.day_schedule as Partial<Day> | null | undefined
                if (snapshot?.start && snapshot.end)
                  return {
                    weekday,
                    enabled: row?.is_available === true,
                    start: snapshot.start,
                    end: snapshot.end,
                    breaks: snapshot.breaks ?? [],
                  }
                return dayFromPeriods(
                  weekday,
                  row?.is_available === true,
                  (row?.periods ?? []) as Period[],
                )
              }),
            }
          }),
        }
      }),
  )

  app.put<{ Params: { clinicId: string; professionalId: string }; Body: Record<string, unknown> }>(
    '/clinics/:clinicId/team/:professionalId',
    {
      schema: {
        params: itemParams('professionalId'),
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'role', 'gender', 'audience', 'serviceIds', 'days'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 160 },
            role: { type: 'string', maxLength: 120 },
            gender: { type: 'string', enum: ['female', 'male'] },
            audience: { type: 'string', enum: ['all', 'women', 'men'] },
            confirmCancellations: confirmCancellationsSchema,
            photoAssetId: { type: 'string', pattern: `^$|${uuidPattern}` },
            membershipId: { anyOf: [{ type: 'string', pattern: uuidPattern }, { type: 'null' }] },
            serviceIds: {
              type: 'array',
              maxItems: 80,
              uniqueItems: true,
              items: { type: 'string', pattern: uuidPattern },
            },
            serviceAudiences: {
              type: 'object',
              maxProperties: 80,
              additionalProperties: { type: 'string', enum: ['all', 'women', 'men'] },
            },
            days: {
              type: 'array',
              minItems: 7,
              maxItems: 7,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['weekday', 'enabled', 'start', 'end', 'breaks'],
                properties: {
                  weekday: { type: 'integer', minimum: 0, maximum: 6 },
                  enabled: { type: 'boolean' },
                  start: clock,
                  end: clock,
                  breaks: {
                    type: 'array',
                    maxItems: 4,
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      required: ['start', 'end'],
                      properties: { start: clock, end: clock },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) =>
      withCancellationMail(mail, reply, (outbox) =>
        authorized(request, reply, 'professional:manage', async (connection, tenant) => {
          const { confirmCancellations, ...professional } = request.body
          const before = await fittingAppointments(connection, tenant.clinicId)
          const id = (
            await connection.query('SELECT luminix.save_professional($1::uuid, $2::jsonb) AS id', [
              tenant.clinicId,
              JSON.stringify({ ...professional, id: request.params.professionalId }),
            ])
          ).rows[0]?.id
          // Her new week can leave clients out (ADR-035): listed first, canceled on confirm.
          const result = await settleScheduleImpact(connection, tenant.clinicId, before, {
            confirm: confirmCancellations === true,
            reason: `${String(professional.name)} mudou o horário de atendimento.`,
            permission: 'professional:manage',
          })
          outbox.push(...result.emails)
          return { id: String(id), canceledAppointments: result.canceled }
        }),
      ),
  )

  app.post<{ Params: { clinicId: string; professionalId: string }; Body: Record<string, never> }>(
    '/clinics/:clinicId/team/:professionalId/archive',
    {
      schema: {
        params: itemParams('professionalId'),
        body: { type: 'object', additionalProperties: false },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'professional:manage', async (connection, tenant) => {
        await connection.query('SELECT luminix.archive_professional($1::uuid, $2::uuid)', [
          tenant.clinicId,
          request.params.professionalId,
        ])
        return { archived: true }
      }),
  )

  app.get<{ Params: { clinicId: string } }>(
    '/clinics/:clinicId/staff',
    { schema: { params: clinicRefParams } },
    async (request, reply) => {
      const result = (await authorized(
        request,
        reply,
        'team:manage',
        async (connection, tenant) => {
          const { rows } = await connection.query(
            'SELECT * FROM luminix.list_staff_members($1::uuid)',
            [tenant.clinicId],
          )
          return rows
        },
      )) as Record<string, unknown>[] | undefined
      if (!Array.isArray(result)) return result
      // Sign-in data is best effort: the list still works if Firebase is unreachable.
      let activity = new Map<string, { lastSignInAt: string | null; disabled: boolean }>()
      try {
        activity =
          (await dependencies.staffDirectory?.describe(
            result.map((row) => String(row.firebase_uid ?? '')).filter(Boolean),
          )) ?? activity
      } catch {
        request.log.warn({ event: 'staff_directory_unavailable' })
      }
      return {
        members: result.map((row) => {
          const account = activity.get(String(row.firebase_uid ?? ''))
          return {
            id: String(row.membership_id),
            name: row.display_name ? String(row.display_name) : '',
            email: row.contact_email ? String(row.contact_email) : '',
            role: String(row.role_name),
            status: String(row.status),
            isSelf: row.is_self === true,
            professionalId: row.professional_id ? String(row.professional_id) : null,
            invitedAt: row.invited_at ? new Date(String(row.invited_at)).toISOString() : null,
            lastSignInAt: account?.lastSignInAt ?? null,
          }
        }),
      }
    },
  )

  app.post<{
    Params: { clinicId: string }
    Body: { name: string; email: string; role: (typeof accessRoles)[number] }
  }>(
    '/clinics/:clinicId/staff',
    {
      schema: {
        params: clinicRefParams,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'email', 'role'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 120 },
            email: {
              type: 'string',
              minLength: 3,
              maxLength: 254,
              pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
            },
            role: { type: 'string', enum: [...accessRoles] },
          },
        },
      },
    },
    async (request, reply) => {
      const email = request.body.email.trim().toLowerCase()
      const name = request.body.name.trim()
      let account: { uid: string; created: boolean } | undefined
      // The Firebase account is created only after team:manage is confirmed for this clinic.
      const result = await authorized(
        request,
        reply,
        'team:manage',
        async (connection, tenant) => {
          if (!account) throw Object.assign(new Error('Directory unavailable'), { statusCode: 503 })
          const identity = (
            await connection.query('SELECT * FROM luminix.resolve_staff_identity($1::text)', [
              account.uid,
            ])
          ).rows[0]
          const memberId = (
            await connection.query(
              'SELECT luminix.invite_staff_member($1::uuid, $2::uuid, $3::text, $4::text, $5::text) AS id',
              [tenant.clinicId, identity?.identity_id, request.body.role, name, email],
            )
          ).rows[0]?.id
          const clinic = await connection.query('SELECT name FROM luminix.clinics WHERE id = $1', [
            tenant.clinicId,
          ])
          return {
            member: { id: String(memberId), email },
            accountCreated: account.created,
            clinicId: tenant.clinicId,
            clinicName: String(clinic.rows[0]?.name ?? ''),
          }
        },
        async (identityId) => {
          if (!dependencies.tenantPool || !dependencies.staffDirectory)
            throw Object.assign(new Error('Directory unavailable'), { statusCode: 503 })
          // Fail fast without touching Firebase when the caller cannot manage the team.
          await withClinicTransaction(
            dependencies.tenantPool,
            identityId,
            request.params.clinicId,
            'team:manage',
            async () => undefined,
          )
          account = await dependencies.staffDirectory.ensureAccount(email, name)
        },
      )
      if (reply.sent) return result
      const { clinicId, clinicName, ...body } = result as {
        member: { id: string; email: string }
        accountCreated: boolean
        clinicId: string
        clinicName: string
      }
      // After commit: a failed e-mail never undoes the access; the panel offers to resend.
      const mail = accessMail(dependencies)
      let emailSent = false
      if (mail) {
        try {
          await mail.invite({ clinicId, email, name, clinicName, role: request.body.role })
          emailSent = true
        } catch (error) {
          request.log.warn({ event: 'staff_invite_email_failed', cause: accessMailFailure(error) })
        }
      }
      return { ...body, emailSent }
    },
  )

  // Sends a new sign-in link to an active member (invite again / "não recebi o e-mail").
  // 503 when access e-mails are not configured: the panel then uses Firebase's own e-mail.
  app.post<{ Params: { clinicId: string; memberId: string } }>(
    '/clinics/:clinicId/staff/:memberId/access-link',
    { schema: { params: itemParams('memberId') } },
    async (request, reply) => {
      const mail = accessMail(dependencies)
      const result = await authorized(request, reply, 'team:manage', async (connection, tenant) => {
        const [members, clinic] = await Promise.all([
          connection.query('SELECT * FROM luminix.list_staff_members($1::uuid)', [tenant.clinicId]),
          connection.query('SELECT name FROM luminix.clinics WHERE id = $1', [tenant.clinicId]),
        ])
        const member = members.rows.find(
          (row) => String(row.membership_id) === request.params.memberId,
        )
        if (!member || member.status !== 'active' || !member.contact_email)
          return reply.code(404).send({ error: 'Member not found' })
        return {
          email: String(member.contact_email),
          name: String(member.display_name ?? ''),
          role: String(member.role_name),
          clinicId: tenant.clinicId,
          clinicName: String(clinic.rows[0]?.name ?? ''),
        }
      })
      if (reply.sent) return result
      const target = result as {
        clinicId: string
        email: string
        name: string
        role: string
        clinicName: string
      }
      if (!mail) return reply.code(503).send({ error: 'Email unavailable', email: target.email })
      try {
        await mail.invite(target)
      } catch (error) {
        request.log.warn({ event: 'staff_access_link_failed', cause: accessMailFailure(error) })
        return reply.code(503).send({ error: 'Email unavailable', email: target.email })
      }
      return { sent: true }
    },
  )

  // What Equipe can do in this clinic, beyond its fixed base.
  app.get<{ Params: { clinicId: string } }>(
    '/clinics/:clinicId/access-levels',
    { schema: { params: clinicRefParams } },
    async (request, reply) =>
      authorized(request, reply, 'team:manage', async (connection, tenant) => {
        const { rows } = await connection.query(
          'SELECT * FROM luminix.list_role_options($1::uuid)',
          [tenant.clinicId],
        )
        return {
          options: rows.map((row) => ({
            role: String(row.role_name),
            permission: String(row.permission_code),
            enabled: row.enabled === true,
            enabledByDefault: row.enabled_by_default === true,
          })),
        }
      }),
  )

  app.put<{
    Params: { clinicId: string }
    Body: { role: 'team'; permission: string; enabled: boolean }
  }>(
    '/clinics/:clinicId/access-levels',
    {
      schema: {
        params: clinicRefParams,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['role', 'permission', 'enabled'],
          properties: {
            role: { type: 'string', enum: ['team'] },
            // The SQL function accepts only the whitelisted Equipe options.
            permission: { type: 'string', pattern: '^[a-z]+:[a-z]+$', maxLength: 40 },
            enabled: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'team:manage', async (connection, tenant) => {
        await connection.query(
          'SELECT luminix.set_role_option($1::uuid, $2::text, $3::text, $4::boolean)',
          [tenant.clinicId, request.body.role, request.body.permission, request.body.enabled],
        )
        return { saved: true }
      }),
  )

  app.put<{
    Params: { clinicId: string; memberId: string }
    Body: { role?: (typeof accessRoles)[number]; status?: 'active' | 'revoked'; name?: string }
  }>(
    '/clinics/:clinicId/staff/:memberId',
    {
      schema: {
        params: itemParams('memberId'),
        body: {
          type: 'object',
          additionalProperties: false,
          minProperties: 1,
          properties: {
            role: { type: 'string', enum: [...accessRoles] },
            status: { type: 'string', enum: ['active', 'revoked'] },
            name: { type: 'string', minLength: 1, maxLength: 120 },
          },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'team:manage', async (connection, tenant) => {
        await connection.query(
          'SELECT luminix.update_staff_member($1::uuid, $2::uuid, $3::text, $4::text, $5::text)',
          [
            tenant.clinicId,
            request.params.memberId,
            request.body.role ?? null,
            request.body.status ?? null,
            request.body.name?.trim() ?? null,
          ],
        )
        return { saved: true }
      }),
  )
}
