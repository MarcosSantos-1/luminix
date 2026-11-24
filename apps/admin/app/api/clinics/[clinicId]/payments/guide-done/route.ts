import { isClinicRef } from '@/lib/clinic-ref'
import { staffApiWrite } from '@/lib/staff-api-proxy'

/** "E agora?" finished: the panel notice about the approved account goes away (ADR-041). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ clinicId: string }> },
) {
  const { clinicId } = await params
  if (!isClinicRef(clinicId)) return Response.json({ error: 'Not found' }, { status: 404 })
  return staffApiWrite(request, `/clinics/${clinicId}/payments/guide-done`)
}
