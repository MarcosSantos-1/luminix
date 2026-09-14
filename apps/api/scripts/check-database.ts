import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'

import { createDatabasePool } from '../src/shared/database/pool.js'

if (existsSync('.env')) {
  loadEnvFile('.env')
}

const useDirectConnection = process.argv.includes('--direct')
const environment = useDirectConnection
  ? { ...process.env, DATABASE_URL: process.env.DATABASE_URL_UNPOOLED }
  : process.env
const pool = createDatabasePool(environment)

try {
  const result = await pool.query<{ connected: number }>('select 1 as connected')

  if (result.rows[0]?.connected !== 1) {
    throw new Error('Resposta inesperada do PostgreSQL')
  }

  const connectionKind = useDirectConnection ? 'direta' : 'pooled'
  console.log(`Neon Postgres: conexão ${connectionKind} somente leitura validada`)
} finally {
  await pool.end()
}
