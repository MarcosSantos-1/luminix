import { Pool } from 'pg'

function readPoolSize(value: string | undefined): number {
  const size = Number(value ?? 10)

  if (!Number.isInteger(size) || size < 1 || size > 50) {
    throw new Error('DATABASE_POOL_MAX deve ser um inteiro entre 1 e 50')
  }

  return size
}

export function createDatabasePool(environment: NodeJS.ProcessEnv = process.env): Pool {
  if (!environment.DATABASE_URL) {
    throw new Error('DATABASE_URL não configurada')
  }

  return new Pool({
    allowExitOnIdle: true,
    connectionString: environment.DATABASE_URL,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 10_000,
    lock_timeout: 3_000,
    idle_in_transaction_session_timeout: 15_000,
    max: readPoolSize(environment.DATABASE_POOL_MAX),
  })
}
