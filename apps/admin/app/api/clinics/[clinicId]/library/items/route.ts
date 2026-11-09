import { isClinicRef } from '@/lib/clinic-ref'
import { staffApiGet, staffApiWrite } from '@/lib/staff-api-proxy'

/** Items of one folder (?folder=) or of the trash (?trash=1), with signed URLs. */
export async function GET(request: Request, { params }: { params: Promise<{ clinicId: string }> }) {
  const { clinicId } = await params
  if (!isClinicRef(clinicId)) return Response.json({ error: 'Not found' }, { status: 404 })
  return staffApiGet(request, `/clinics/${clinicId}/library/items`)
}

/** Registers a finished upload in a folder. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ clinicId: string }> },
) {
  const { clinicId } = await params
  if (!isClinicRef(clinicId)) return Response.json({ error: 'Not found' }, { status: 404 })
  return staffApiWrite(request, `/clinics/${clinicId}/library/items`)
}
