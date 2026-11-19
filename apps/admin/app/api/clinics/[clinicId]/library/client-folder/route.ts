import { isClinicRef } from '@/lib/clinic-ref'
import { staffApiWrite } from '@/lib/staff-api-proxy'

/** The client's own folder inside "Clientes" (created on first use). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ clinicId: string }> },
) {
  const { clinicId } = await params
  if (!isClinicRef(clinicId)) return Response.json({ error: 'Not found' }, { status: 404 })
  return staffApiWrite(request, `/clinics/${clinicId}/library/client-folder`)
}
