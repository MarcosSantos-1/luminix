import { staffApiGet } from '@/lib/staff-api-proxy'
export async function GET(request: Request) {
  return staffApiGet(request, '/auth/clinics')
}
