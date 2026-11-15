import { loadPublicClinic, searchPublicClinics } from '../../../lib/load-public-clinic'
import {
  searchDemoSpaces,
  searchTerm,
  slugFromQuery,
  summarizeSearchResult,
  summarizeSpace,
} from '../../../lib/client-app/summary'
import type { SpaceSummary } from '../../../lib/client-app/types'

// Space lookup for the client area: exact code or address first, then the public directory by
// name (published and active spaces only, ADR-028), then the demos.
// Public projection without cookies: the mobile app (and its web build) reads it cross-origin.
export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get('q') ?? '').slice(0, 120)
  const slug = slugFromQuery(query)
  const term = searchTerm(query)
  // Unavailable API, moved address or exhausted search budget: that source just adds nothing.
  const [exact, byName] = await Promise.all([
    slug ? loadPublicClinic(slug).catch(() => null) : null,
    term ? searchPublicClinics(term).catch(() => []) : [],
  ])
  const found = new Map<string, SpaceSummary>()
  if (exact) found.set(exact.slug, summarizeSpace(exact))
  for (const item of byName) {
    const space = summarizeSearchResult(item)
    if (space && !found.has(space.slug)) found.set(space.slug, space)
  }
  for (const space of searchDemoSpaces(query)) found.set(space.slug, space)
  return Response.json(
    { spaces: [...found.values()].slice(0, 12) },
    { headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } },
  )
}
