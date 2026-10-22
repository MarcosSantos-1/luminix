import { isClinicRef } from '@/lib/clinic-ref'
import { staffApiGet } from '@/lib/staff-api-proxy'
export async function GET(request: Request, { params }: { params: Promise<{ clinicId: string }> }) {
  const { clinicId } = await params
  if (!isClinicRef(clinicId)) return Response.json({ error: 'Not found' }, { status: 404 })
  return staffApiGet(request, `/clinics/${clinicId}/payments/connect`)
}
