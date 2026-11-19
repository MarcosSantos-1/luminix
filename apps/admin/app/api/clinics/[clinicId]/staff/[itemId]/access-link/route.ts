import { isClinicRef } from '@/lib/clinic-ref'
import { staffApiWrite } from '@/lib/staff-api-proxy'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Sends a new sign-in link (invite again) to an active member. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ clinicId: string; itemId: string }> },
) {
  const { clinicId, itemId } = await params
  if (!isClinicRef(clinicId) || !uuid.test(itemId))
    return Response.json({ error: 'Not found' }, { status: 404 })
  return staffApiWrite(request, `/clinics/${clinicId}/staff/${itemId}/access-link`)
}
