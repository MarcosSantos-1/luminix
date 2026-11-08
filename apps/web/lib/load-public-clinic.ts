import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { connection } from 'next/server'
import { isPublicClinicSlug, publicClinicTag } from './public-clinic-cache'
import type { PublicClinic } from './public-clinic'
import { getPreviewClinic } from './preview-clinic'

class ClinicNotPublished extends Error {}

async function fetchPublicClinic(slug: string): Promise<PublicClinic> {
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
  if (response.status === 404) throw new ClinicNotPublished()
  if (!response.ok) throw new Error('Public clinic unavailable')
  const data = (await response.json()) as { clinic: PublicClinic }
  if (data.clinic?.slug !== slug || !Array.isArray(data.clinic.services))
    throw new Error('Invalid public clinic')
  return data.clinic
}

export const loadPublicClinic = cache(async (slug: string): Promise<PublicClinic | null> => {
  if (!isPublicClinicSlug(slug)) return null
  const demo = getPreviewClinic(slug)
  if (demo) return demo

  // Render against the current minute. An old entry cannot outlive a missed invalidation,
  // even when the API is down. A missing clinic is never stored as a successful cache result.
  await connection()
  const minute = Math.floor(Date.now() / 60_000)
  try {
    return await unstable_cache(fetchPublicClinic, [String(minute)], {
      tags: [publicClinicTag(slug)],
      revalidate: 60,
    })(slug)
  } catch (error) {
    if (error instanceof ClinicNotPublished) return null
    throw error
  }
})
