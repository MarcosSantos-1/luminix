import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'

import { buildApp } from './app.js'
import { readConfig } from './shared/config/env.js'

if (existsSync('.env')) {
  loadEnvFile('.env')
}

const config = readConfig()
const app = await buildApp({
  logger: {
    level: config.logLevel,
    redact: ['req.headers.authorization'],
  },
})

try {
  await app.listen({ host: config.host, port: config.port })
} catch (error) {
  app.log.error(error)
  process.exitCode = 1
}
