import { staffApiGet } from '@/lib/staff-api-proxy'
export async function GET(
  request: Request,
  { params }: { params: Promise<{ clinicId: string; resource: string }> },
) {
  const { clinicId, resource } = await params
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clinicId) ||
    !['context', 'settings'].includes(resource)
  )
    return Response.json(
      { error: 'Not found' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    )
  return staffApiGet(
    request,
    resource === 'context' ? `/clinics/${clinicId}/context` : `/clinics/${clinicId}/settings`,
  )
}
