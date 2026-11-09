import { isClinicRef } from '@/lib/clinic-ref'
import { staffApiWrite } from '@/lib/staff-api-proxy'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ clinicId: string; folderId: string }> },
) {
  const { clinicId, folderId } = await params
  if (!isClinicRef(clinicId) || !uuid.test(folderId))
    return Response.json({ error: 'Not found' }, { status: 404 })
  return staffApiWrite(request, `/clinics/${clinicId}/library/folders/${folderId}`)
}
