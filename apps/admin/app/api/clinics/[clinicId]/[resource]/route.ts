import { isClinicRef } from '@/lib/clinic-ref'
import { staffApiGet, staffApiWrite } from '@/lib/staff-api-proxy'

const notFound = () =>
  Response.json({ error: 'Not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })

const readable = [
  'context',
  'settings',
  'onboarding',
  'overview',
  'clients',
  'agenda',
  'profile',
  'booking-rules',
  'slug',
  'team',
  'staff',
  'catalog',
  'dashboard',
  'finance',
  'reports',
  'marketing',
  'inventory',
  'activity',
  'notices',
  'search',
  'account',
  'closures',
] as const
const writable = [
  'onboarding',
  'availability',
  'schedule-plan',
  'theme',
  'profile',
  'booking-rules',
  'slug',
  'account',
] as const

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clinicId: string; resource: string }> },
) {
  const { clinicId, resource } = await params
  const match = readable.find((item) => item === resource)
  if (!isClinicRef(clinicId) || !match) return notFound()
  return staffApiGet(request, `/clinics/${clinicId}/${match}`)
}
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ clinicId: string; resource: string }> },
) {
  const { clinicId, resource } = await params
  const match = writable.find((item) => item === resource)
  if (!isClinicRef(clinicId) || !match) return notFound()
  return staffApiWrite(request, `/clinics/${clinicId}/${match}`)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clinicId: string; resource: string }> },
) {
  const { clinicId, resource } = await params
  if (
    !isClinicRef(clinicId) ||
    !['clients', 'appointments', 'staff', 'closures'].includes(resource)
  )
    return notFound()
  return staffApiWrite(
    request,
    resource === 'clients'
      ? `/clinics/${clinicId}/clients`
      : resource === 'staff'
        ? `/clinics/${clinicId}/staff`
        : resource === 'closures'
          ? `/clinics/${clinicId}/closures`
          : `/clinics/${clinicId}/appointments`,
  )
}
