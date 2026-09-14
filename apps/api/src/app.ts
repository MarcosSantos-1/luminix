import Fastify, { type FastifyServerOptions } from 'fastify'

import { healthRoutes } from './modules/health/routes.js'
import { registerTenantContext } from './shared/tenant/tenant-context.js'

export async function buildApp(options: FastifyServerOptions = {}) {
  const app = Fastify(options)

  await registerTenantContext(app)
  await app.register(healthRoutes)

  return app
}
