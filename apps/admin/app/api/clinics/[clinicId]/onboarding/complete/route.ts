import { staffApiWrite } from '@/lib/staff-api-proxy'
export async function POST(
  request: Request,
  { params }: { params: Promise<{ clinicId: string }> },
) {
  const { clinicId } = await params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clinicId))
    return Response.json(
      { error: 'Not found' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    )
  return staffApiWrite(request, `/clinics/${clinicId}/onboarding/complete`)
}
