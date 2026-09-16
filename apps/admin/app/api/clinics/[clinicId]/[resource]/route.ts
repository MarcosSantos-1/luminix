import { staffApiGet, staffApiWrite } from '@/lib/staff-api-proxy'
export async function GET(
  request: Request,
  { params }: { params: Promise<{ clinicId: string; resource: string }> },
) {
  const { clinicId, resource } = await params
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clinicId) ||
    !['context', 'settings', 'onboarding', 'overview'].includes(resource)
  )
    return Response.json(
      { error: 'Not found' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    )
  const path =
    resource === 'context'
      ? (`/clinics/${clinicId}/context` as const)
      : resource === 'settings'
        ? (`/clinics/${clinicId}/settings` as const)
        : resource === 'overview'
          ? (`/clinics/${clinicId}/overview` as const)
          : (`/clinics/${clinicId}/onboarding` as const)
  return staffApiGet(request, path)
}
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ clinicId: string; resource: string }> },
) {
  const { clinicId, resource } = await params
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clinicId) ||
    resource !== 'onboarding'
  )
    return Response.json(
      { error: 'Not found' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    )
  return staffApiWrite(request, `/clinics/${clinicId}/onboarding`)
}
