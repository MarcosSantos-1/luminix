import { isClinicRef } from '@/lib/clinic-ref'
import { staffApiGet, staffApiWrite } from '@/lib/staff-api-proxy'

const id = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
// Closed list of nested read paths. Only the client detail (full CPF + history) today.
const reads = [new RegExp(`^clients/${id}$`, 'i')]
// Closed list of nested write paths (after /clinics/:clinicId/). Anything else is 404.
const writes: Record<'PUT' | 'POST', RegExp[]> = {
  PUT: [
    new RegExp(`^catalog/services/${id}$`, 'i'),
    new RegExp(`^catalog/promotions/${id}$`, 'i'),
    new RegExp(`^inventory/items/${id}$`, 'i'),
    new RegExp(`^appointments/${id}/status$`, 'i'),
    new RegExp(`^clients/${id}$`, 'i'),
    new RegExp(`^clients/${id}/status$`, 'i'),
  ],
  POST: [
    new RegExp(`^catalog/services/${id}/status$`, 'i'),
    /^finance\/entries$/,
    /^activity\/state$/,
    new RegExp(`^finance/entries/${id}/void$`, 'i'),
    new RegExp(`^inventory/items/${id}/(movements|archive)$`, 'i'),
  ],
}

async function forward(
  method: 'PUT' | 'POST',
  request: Request,
  params: Promise<{ clinicId: string; resource: string; rest: string[] }>,
) {
  const { clinicId, resource, rest } = await params
  const path = [resource, ...rest].join('/')
  if (!isClinicRef(clinicId) || !writes[method].some((pattern) => pattern.test(path)))
    return Response.json(
      { error: 'Not found' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    )
  return staffApiWrite(
    request,
    `/clinics/${clinicId}/${path}` as `/clinics/${string}/business/${string}`,
  )
}

type Context = { params: Promise<{ clinicId: string; resource: string; rest: string[] }> }
export async function GET(request: Request, { params }: Context) {
  const { clinicId, resource, rest } = await params
  const path = [resource, ...rest].join('/')
  if (!isClinicRef(clinicId) || !reads.some((pattern) => pattern.test(path)))
    return Response.json(
      { error: 'Not found' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    )
  return staffApiGet(
    request,
    `/clinics/${clinicId}/${path}` as `/clinics/${string}/clients/${string}`,
  )
}
export const PUT = (request: Request, { params }: Context) => forward('PUT', request, params)
export const POST = (request: Request, { params }: Context) => forward('POST', request, params)
