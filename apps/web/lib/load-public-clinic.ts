import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { connection } from 'next/server'
import { permanentRedirect } from 'next/navigation'
import { isPublicClinicSlug, publicClinicTag } from './public-clinic-cache'
import type { PublicClinic } from './public-clinic'
import { getPreviewClinic } from './preview-clinic'

class ClinicNotPublished extends Error {}
/** The clinic changed its address; the API returns the current slug for published pages. */
class ClinicMoved extends Error {
  constructor(readonly slug: string) {
    super('Clinic moved')
  }
}

function publicApiBase() {
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
  return base
}

async function fetchClinicSearch(term: string): Promise<unknown[]> {
  const url = new URL('/public/clinic-search', publicApiBase())
  url.searchParams.set('q', term)
  const response = await fetch(url, {
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error('Public search unavailable')
  const data = (await response.json()) as { clinics?: unknown }
  if (!Array.isArray(data.clinics)) throw new Error('Invalid public search')
  return data.clinics
}

/**
 * Published spaces whose public name contains the folded term (see `searchTerm`). Same freshness
 * as the public page: an answer lives for the current minute at most, and failures are not stored.
 */
export async function searchPublicClinics(term: string): Promise<unknown[]> {
  await connection()
  const minute = Math.floor(Date.now() / 60_000)
  return unstable_cache(fetchClinicSearch, ['public-clinic-search', String(minute)], {
    revalidate: 60,
  })(term)
}

async function fetchPublicClinic(slug: string): Promise<PublicClinic> {
  const base = publicApiBase()
  const response = await fetch(new URL(`/public/clinics/${encodeURIComponent(slug)}`, base), {
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  })
  if (response.status === 404) throw new ClinicNotPublished()
  if (!response.ok) throw new Error('Public clinic unavailable')
  const data = (await response.json()) as { clinic: PublicClinic; redirectTo?: string }
  if (typeof data.redirectTo === 'string') {
    if (!isPublicClinicSlug(data.redirectTo) || data.redirectTo === slug)
      throw new Error('Invalid public clinic')
    throw new ClinicMoved(data.redirectTo)
  }
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
    if (error instanceof ClinicMoved) permanentRedirect(`/c/${encodeURIComponent(error.slug)}`)
    throw error
  }
})
