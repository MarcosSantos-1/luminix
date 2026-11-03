import { isClinicRef } from '@/lib/clinic-ref'
import { staffApiGet, staffApiWrite } from '@/lib/staff-api-proxy'

export async function GET(request: Request, { params }: { params: Promise<{ clinicId: string }> }) {
  const { clinicId } = await params
  if (!isClinicRef(clinicId)) return Response.json({ error: 'Not found' }, { status: 404 })
  return staffApiGet(request, `/clinics/${clinicId}/publication`)
}
export async function PUT(request: Request, { params }: { params: Promise<{ clinicId: string }> }) {
  const { clinicId } = await params
  if (!isClinicRef(clinicId)) return Response.json({ error: 'Not found' }, { status: 404 })
  return staffApiWrite(request, `/clinics/${clinicId}/publication`)
}
