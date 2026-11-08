import type { FastifyBaseLogger } from 'fastify'

// Called after commit. A missed notification expires within the web cache's one-minute window.
export async function invalidatePublicClinic(slug: string, log: FastifyBaseLogger) {
  const origin = process.env.PUBLIC_CLINIC_WEB_ORIGIN
  const secret = process.env.CLINIC_CACHE_SECRET
  if (!origin || !secret) return

  try {
    const endpoint = new URL('/api/clinic-cache/revalidate', origin)
    if (
      endpoint.protocol !== 'https:' &&
      !(
        process.env.NODE_ENV !== 'production' &&
        endpoint.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(endpoint.hostname)
      )
    )
      throw new Error('Invalid public web origin')
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
      redirect: 'error',
      signal: AbortSignal.timeout(3_000),
    })
    if (!response.ok) throw new Error('Cache invalidation unavailable')
  } catch {
    log.warn({ event: 'public_clinic_cache_invalidation_failed' })
  }
}
