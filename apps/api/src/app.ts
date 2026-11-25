import Fastify, { type FastifyServerOptions } from 'fastify'

import { publicClinicRoutes } from './modules/public-clinics/routes.js'
import { clientRoutes } from './modules/client/routes.js'
import { appointmentLinkRoutes } from './modules/client/appointment-links.js'
import { onlinePaymentRoutes } from './modules/payments/online-routes.js'
import { healthRoutes } from './modules/health/routes.js'
import { authRoutes, type AuthDependencies } from './modules/auth/routes.js'
import { passwordResetRoutes } from './modules/auth/password-reset.js'
import { registerTenantContext } from './shared/tenant/tenant-context.js'

export async function buildApp(options: FastifyServerOptions = {}, auth?: AuthDependencies) {
  const app = Fastify({
    ...options,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  })
  app.addContentTypeParser('image/webp', { parseAs: 'buffer' }, (_request, body, done) => {
    done(null, body)
  })

  await registerTenantContext(app)
  await app.register(healthRoutes)
  if (auth) {
    await authRoutes(app, auth)
    await publicClinicRoutes(app, auth.database)
    await clientRoutes(app, auth)
    // After clientRoutes: reuses its /client/ CORS hook and preflight.
    await appointmentLinkRoutes(app, auth.database)
    await passwordResetRoutes(app, auth)
    await onlinePaymentRoutes(app, auth)
  }

  return app
}
