import { loadPublicClinic } from '../../../../lib/load-public-clinic'
import { summarizeSpace } from '../../../../lib/client-app/summary'

// Same public projection the clinic site renders, as JSON for the client area.
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  try {
    const clinic = await loadPublicClinic(slug)
    if (!clinic) return Response.json({ error: 'Space not found' }, { status: 404 })
    return Response.json(
      { clinic, summary: summarizeSpace(clinic) },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json({ error: 'Space unavailable' }, { status: 503 })
  }
}
