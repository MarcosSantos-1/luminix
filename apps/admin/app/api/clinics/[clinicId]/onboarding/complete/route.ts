import { isClinicRef } from '@/lib/clinic-ref'
import { staffApiWrite } from '@/lib/staff-api-proxy'
export async function POST(
  request: Request,
  { params }: { params: Promise<{ clinicId: string }> },
) {
  const { clinicId } = await params
  if (!isClinicRef(clinicId))
    return Response.json(
      { error: 'Not found' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    )
  return staffApiWrite(request, `/clinics/${clinicId}/onboarding/complete`)
}
