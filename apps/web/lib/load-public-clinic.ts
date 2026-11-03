import { cache } from 'react'
import type { PublicClinic } from './public-clinic'
import { getPreviewClinic } from './preview-clinic'

export const loadPublicClinic = cache(async (slug: string): Promise<PublicClinic | null> => {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 80) return null
  const demo = getPreviewClinic(slug)
  if (demo) return demo
  const base = new URL(process.env.API_URL ?? 'https://luminix-api.fly.dev')
  if (
    base.protocol !== 'https:' &&
    !(
      process.env.NODE_ENV !== 'production' &&
      base.protocol === 'http:' &&
      ['localhost', '127.0.0.1'].includes(base.hostname)
    )
  )
    throw new Error('Public API unavailable')
  const response = await fetch(new URL(`/public/clinics/${encodeURIComponent(slug)}`, base), {
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error('Public clinic unavailable')
  const data = (await response.json()) as { clinic: PublicClinic }
  if (data.clinic?.slug !== slug || !Array.isArray(data.clinic.services))
    throw new Error('Invalid public clinic')
  return data.clinic
})
