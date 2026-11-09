import type { SqlConnection } from '../database/migrations.js'
import type { TenantContext } from './tenant-context.js'
import { clinicRefParams } from './authorized-route.js'

export const uuidPattern =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
export const uuidSchema = { type: 'string', pattern: uuidPattern } as const
export const dateSchema = { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' } as const

/** Params schema for `/clinics/:clinicId/<...>/:<name>`. */
export function clinicItemParams(name: string) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['clinicId', name],
    properties: { ...clinicRefParams.properties, [name]: uuidSchema },
  }
}

/** Permissions of the caller's role, to shape optional parts of a response. */
export async function rolePermissions(connection: SqlConnection, tenant: TenantContext) {
  const { rows } = await connection.query(
    'SELECT permission_code FROM luminix.role_permissions WHERE clinic_id = $1 AND role_id = $2',
    [tenant.clinicId, tenant.role],
  )
  return new Set(rows.map((row) => String(row.permission_code)))
}

export const toNumber = (value: unknown) => (value == null ? 0 : Number(value))
export const isoDate = (value: unknown) =>
  value instanceof Date
    ? value.toISOString().slice(0, 10)
    : value
      ? String(value).slice(0, 10)
      : null
