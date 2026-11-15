import { loadPublicClinic } from '../../../lib/load-public-clinic'
import { searchDemoSpaces, slugFromQuery, summarizeSpace } from '../../../lib/client-app/summary'
import type { SpaceSummary } from '../../../lib/client-app/types'

// Space lookup for the client area. Published spaces resolve only by exact code or address:
// there is no public directory of clinics by name yet (needs an API decision, see docs/16).
// Public projection without cookies: the mobile app (and its web build) reads it cross-origin.
export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get('q') ?? '').slice(0, 120)
  const found = new Map<string, SpaceSummary>()
  const slug = slugFromQuery(query)
  if (slug) {
    try {
      const clinic = await loadPublicClinic(slug)
      if (clinic) found.set(clinic.slug, summarizeSpace(clinic))
    } catch {
      // Unavailable API or moved address: the search simply returns no exact match.
    }
  }
  for (const space of searchDemoSpaces(query)) found.set(space.slug, space)
  return Response.json(
    { spaces: [...found.values()].slice(0, 12) },
    { headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } },
  )
}
