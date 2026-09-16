import type { SqlConnection } from './migrations.js'

export async function assertRuntimeDatabaseSecurity(database: SqlConnection): Promise<void> {
  const result =
    await database.query(`SELECT r.rolname, r.rolsuper, r.rolbypassrls, r.rolcreatedb, r.rolcreaterole, r.rolreplication,
    has_database_privilege(current_user, current_database(), 'CREATE') AS db_create,
    has_database_privilege(current_user, current_database(), 'TEMP') AS db_temp,
    EXISTS (SELECT 1 FROM pg_roles p WHERE p.oid <> r.oid AND pg_has_role(r.oid, p.oid, 'MEMBER')
      AND (p.rolsuper OR p.rolbypassrls OR p.rolcreatedb OR p.rolcreaterole OR p.rolreplication OR p.rolname IN ('neon_superuser', 'pg_database_owner'))) AS privileged_membership,
    EXISTS (SELECT 1 FROM pg_class c WHERE c.relnamespace IN ('luminix'::regnamespace, 'luminix_migrations'::regnamespace) AND c.relowner = r.oid) AS owns_tables,
    EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname IN ('luminix', 'luminix_migrations', 'public') AND (n.nspowner = r.oid OR has_schema_privilege(r.oid, n.oid, 'CREATE'))) AS schema_create,
    EXISTS (SELECT 1 FROM pg_class c WHERE c.relnamespace IN ('luminix'::regnamespace, 'luminix_migrations'::regnamespace) AND c.relkind = 'r'
      AND (has_table_privilege(r.oid, c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE') OR has_any_column_privilege(r.oid, c.oid, 'UPDATE'))) AS writes_tables
    FROM pg_roles r WHERE r.rolname = current_user`)
  const role = result.rows[0]
  if (
    !role ||
    role.rolname !== 'luminix_api' ||
    Object.entries(role).some(([key, value]) => key !== 'rolname' && value === true)
  ) {
    throw new Error(
      'Runtime database role must be restricted luminix_api; refusing privileged connection',
    )
  }
}
