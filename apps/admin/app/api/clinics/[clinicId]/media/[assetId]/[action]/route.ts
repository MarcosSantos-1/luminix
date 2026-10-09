import { isClinicRef } from '@/lib/clinic-ref'
import { staffApiImageWrite, staffApiWrite } from '@/lib/staff-api-proxy'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ clinicId: string; assetId: string; action: string }> },
) {
  const { clinicId, assetId, action } = await params
  if (!isClinicRef(clinicId) || !uuid.test(assetId) || !['small', 'large'].includes(action))
    return Response.json(
      { error: 'Not found' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    )
  return staffApiImageWrite(
    request,
    `/clinics/${clinicId}/media/${assetId}/${action as 'small' | 'large'}`,
  )
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clinicId: string; assetId: string; action: string }> },
) {
  const { clinicId, assetId, action } = await params
  if (!isClinicRef(clinicId) || !uuid.test(assetId) || action !== 'finalize')
    return Response.json(
      { error: 'Not found' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    )
  return staffApiWrite(request, `/clinics/${clinicId}/media/${assetId}/finalize`)
}
