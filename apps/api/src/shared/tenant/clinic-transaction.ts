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

// identityId MUST come from a verified server-side session, never request input.
// selectedClinicId is only a selection; authorization derives the actual context from SQL.
export async function withClinicTransaction<T>(
  pool: TenantPool,
  identityId: string,
  selectedClinicId: string,
  requiredPermission: string | null,
  work: (connection: SqlConnection, tenant: TenantContext) => Promise<T>,
): Promise<T> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuid.test(identityId) || !uuid.test(selectedClinicId)) throw forbidden()
  const connection = await pool.connect()
  let begun = false
  let discard = false
  try {
    await connection.query('BEGIN')
    begun = true
    try {
      await connection.query(
        "SELECT set_config('luminix.clinic_id', $1, true), set_config('luminix.identity_id', $2, true)",
        [selectedClinicId, identityId],
      )
      const result = await connection.query(
        'SELECT * FROM luminix.authorize_staff_clinic($1::uuid, $2::uuid, $3::text)',
        [identityId, selectedClinicId, requiredPermission],
      )
      const membership = result.rows[0]
      if (!membership) throw forbidden()
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
