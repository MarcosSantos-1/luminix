import Fastify, { type FastifyServerOptions } from 'fastify'

import { healthRoutes } from './modules/health/routes.js'
import { authRoutes, type AuthDependencies } from './modules/auth/routes.js'
import { registerTenantContext } from './shared/tenant/tenant-context.js'

export async function buildApp(options: FastifyServerOptions = {}, auth?: AuthDependencies) {
  const app = Fastify({
    ...options,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  })

  await registerTenantContext(app)
  await app.register(healthRoutes)
  if (auth) await authRoutes(app, auth)

  return app
}
