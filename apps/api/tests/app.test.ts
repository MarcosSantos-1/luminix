import { afterEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { requireTenantContext } from '../src/shared/tenant/tenant-context.js'

const apps: Awaited<ReturnType<typeof buildApp>>[] = []

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

describe('API bootstrap', () => {
  it('exposes a health check', async () => {
    const app = await buildApp()
    apps.push(app)

    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
  })

  it('does not trust a clinic id sent by the client', async () => {
    const app = await buildApp()
    apps.push(app)
    app.get('/tenant-probe', async (request) => ({ tenantContext: request.tenantContext }))

    const response = await app.inject({
      method: 'GET',
      url: '/tenant-probe',
      headers: { 'x-clinic-id': 'clinic-from-client' },
    })

    expect(response.json()).toEqual({ tenantContext: null })
  })

  it('fails closed when a tenant-aware route has no authorized context', async () => {
    const app = await buildApp()
    apps.push(app)
    app.get('/tenant-required', async (request) => {
      const tenant = requireTenantContext(request)
      return { clinicId: tenant.clinicId }
    })

    const response = await app.inject({
      method: 'GET',
      url: '/tenant-required',
      headers: { 'x-clinic-id': 'clinic-from-client' },
    })

    expect(response.statusCode).toBe(401)
  })
})
