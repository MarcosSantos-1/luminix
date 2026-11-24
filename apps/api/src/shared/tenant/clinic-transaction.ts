import type { FastifyRequest } from 'fastify'
import type { SqlConnection } from '../database/migrations.js'
import type { TenantContext } from './tenant-context.js'

export interface TenantConnection extends SqlConnection {
  release(discard?: boolean): void
}

export interface TenantPool {
  connect(): Promise<TenantConnection>
}

function forbidden(): Error {
  return Object.assign(new Error('Clinic access denied'), { statusCode: 403, code: '42501' })
}

/** Raised inside the transaction when a clinic without a valid plan tries to change data. */
export function subscriptionRequired(): Error {
  return Object.assign(new Error('Subscription required'), { statusCode: 402 })
}

// Paying, finishing the first setup and marking notices as read stay open in read-only mode.
const openWhenReadOnly =
  /^\/clinics\/:clinicId\/(?:billing(?:\/|$)|onboarding(?:\/|$)|activity\/state$)/

/**
 * Whether this request changes clinic data and so needs a valid plan (ADR-039). Reads (GET)
 * always work: a clinic in read-only mode keeps seeing everything it has.
 */
export function guardsWrites(request: FastifyRequest) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return false
  return !openWhenReadOnly.test(request.routeOptions.url ?? '')
}

// identityId MUST come from a verified server-side session, never request input.
// selectedClinicId is only a selection; authorization derives the actual context from SQL.
export async function withClinicTransaction<T>(
  pool: TenantPool,
  identityId: string,
  selectedClinicId: string,
  requiredPermission: string | null,
  work: (connection: SqlConnection, tenant: TenantContext) => Promise<T>,
  options: { guardWrites?: boolean } = {},
): Promise<T> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuid.test(identityId)) throw forbidden()
  const connection = await pool.connect()
  let begun = false
  let discard = false
  try {
    await connection.query('BEGIN')
    begun = true
    try {
      const resolved = await connection.query('SELECT luminix.resolve_clinic_ref($1) AS id', [
        selectedClinicId,
      ])
      const clinicId = resolved.rows[0]?.id ? String(resolved.rows[0].id) : ''
      if (!uuid.test(clinicId)) throw forbidden()
      await connection.query(
        "SELECT set_config('luminix.clinic_id', $1, true), set_config('luminix.identity_id', $2, true)",
        [clinicId, identityId],
      )
      const result = await connection.query(
        'SELECT * FROM luminix.authorize_staff_clinic($1::uuid, $2::uuid, $3::text)',
        [identityId, clinicId, requiredPermission],
      )
      const membership = result.rows[0]
      if (!membership) throw forbidden()
      // After authorization, so only members learn that the clinic is in read-only mode.
      if (options.guardWrites) {
        const access = await connection.query(
          "SELECT luminix.clinic_access_state($1::uuid)->>'state' AS state",
          [clinicId],
        )
        if (access.rows[0]?.state === 'read_only') throw subscriptionRequired()
      }
      const tenant: TenantContext = Object.freeze({
        clinicId: String(membership.clinic_id),
        membershipId: String(membership.membership_id),
        role: String(membership.role_id),
        userId: String(membership.identity_id),
      })
      const value = await work(connection, tenant)
      await connection.query('COMMIT')
      return value
    } catch (error) {
      try {
        await connection.query('ROLLBACK')
      } catch {
        // Never return a possibly scoped transaction to the pool after rollback failure.
        discard = true
      }
      if ((error as { code?: string })?.code === '42501') throw forbidden()
      throw error
    }
  } finally {
    connection.release(discard || !begun)
  }
}
