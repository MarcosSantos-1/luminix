import { isClinicRef } from '@/lib/clinic-ref'
import { staffApiGet } from '@/lib/staff-api-proxy'

/** Folders, counts and storage usage of the media library. */
export async function GET(request: Request, { params }: { params: Promise<{ clinicId: string }> }) {
  const { clinicId } = await params
  if (!isClinicRef(clinicId)) return Response.json({ error: 'Not found' }, { status: 404 })
  return staffApiGet(request, `/clinics/${clinicId}/library`)
}
