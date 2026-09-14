import type { FastifyInstance, FastifyRequest } from 'fastify'

export type TenantContext = Readonly<{
  clinicId: string
  membershipId: string
  role: string
  userId: string
}>

declare module 'fastify' {
  interface FastifyRequest {
    tenantContext: TenantContext | null
  }
}

export async function registerTenantContext(app: FastifyInstance): Promise<void> {
  // Somente o futuro módulo de autenticação/autorização poderá preencher este valor
  // após validar identidade e membership. Headers enviados pelo cliente são ignorados.
  app.decorateRequest('tenantContext', null)
}

export function requireTenantContext(request: FastifyRequest): TenantContext {
  if (!request.tenantContext) {
    const error = new Error('Tenant context is required')
    Object.assign(error, { statusCode: 401 })
    throw error
  }

  return request.tenantContext
}
