import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'

import { buildApp } from './app.js'
import { readConfig } from './shared/config/env.js'
import { createLoggerOptions } from './shared/config/logger.js'
import { createDatabasePool } from './shared/database/pool.js'
import { assertRuntimeDatabaseSecurity } from './shared/database/runtime-security.js'
import { verifyFirebaseIdToken } from './shared/integrations/firebase/admin.js'

if (existsSync('.env')) {
  loadEnvFile('.env')
}

const config = readConfig()
const database = createDatabasePool({
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL_RUNTIME,
})
try {
  await assertRuntimeDatabaseSecurity(database)
} catch (error) {
  await database.end()
  throw error
}
const app = await buildApp(
  {
    logger: createLoggerOptions(config),
  },
  { database, tenantPool: database, verifyToken: verifyFirebaseIdToken },
)
app.addHook('onClose', async () => database.end())

try {
  await app.listen({ host: config.host, port: config.port })
  const localHost = ['0.0.0.0', '::'].includes(config.host) ? 'localhost' : config.host
  const baseUrl = `http://${localHost.includes(':') ? `[${localHost}]` : localHost}:${config.port}`
  app.log.info(`🚀 Luminix API pronta | ambiente: ${config.nodeEnv}`)
  app.log.info(`🔗 API: ${baseUrl} | health: ${baseUrl}/health`)
  if (config.nodeEnv === 'development') {
    app.log.info('🛠️ Desenvolvimento | reqId identifica a requisição | responseTime em ms')
  }
} catch (error) {
  app.log.error({ err: error }, '❌ Não foi possível iniciar a Luminix API')
  if (error instanceof Error && 'code' in error && error.code === 'EADDRINUSE') {
    app.log.error(`🔌 Porta ${config.port} ocupada. Pare a API anterior ou altere PORT no .env.`)
  }
  await app.close()
  process.exitCode = 1
}
