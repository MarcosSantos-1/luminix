import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'

export interface SqlConnection {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>
}

const migrationDirectory = new URL('../../../migrations/', import.meta.url)

// Caller supplies an isolated/explicitly verified destination. No environment fallback.
export async function applyMigrations(connection: SqlConnection): Promise<void> {
  const files = (await readdir(migrationDirectory))
    .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/.test(file))
    .sort()

  await connection.query('BEGIN')
  try {
    await connection.query('SELECT pg_advisory_xact_lock(76241003)')
    await connection.query('CREATE SCHEMA IF NOT EXISTS luminix_migrations')
    await connection.query('REVOKE ALL ON SCHEMA luminix_migrations FROM PUBLIC')
    await connection.query(`CREATE TABLE IF NOT EXISTS luminix_migrations.applied (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`)
    const applied = await connection.query('SELECT name, checksum FROM luminix_migrations.applied')
    const knownFiles = new Set(files)
    for (const row of applied.rows) {
      if (!knownFiles.has(String(row.name))) throw new Error('Applied migration is missing')
    }
    const latestApplied = applied.rows
      .map((row) => String(row.name))
      .sort()
      .at(-1)
    if (
      latestApplied &&
      files.some((file) => file < latestApplied && !applied.rows.some((row) => row.name === file))
    ) {
      throw new Error('Migration cannot be inserted before an applied version')
    }
    for (const file of files) {
      const sql = await readFile(new URL(file, migrationDirectory), 'utf8')
      const checksum = createHash('sha256').update(sql).digest('hex')
      const previous = applied.rows.find((row) => row.name === file)
      if (previous) {
        if (previous.checksum !== checksum) throw new Error('Applied migration checksum changed')
        continue
      }
      await connection.query(sql)
      await connection.query(
        'INSERT INTO luminix_migrations.applied (name, checksum) VALUES ($1, $2)',
        [file, checksum],
      )
    }
    await connection.query('COMMIT')
  } catch (error) {
    await connection.query('ROLLBACK')
    throw error
  }
}
