import { staffApiGet } from '@/lib/staff-api-proxy'

export async function GET(request: Request, { params }: { params: Promise<{ cep: string }> }) {
  const { cep } = await params
  if (!/^[0-9]{8}$/.test(cep))
    return Response.json(
      { error: 'Invalid postal code' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  return staffApiGet(request, `/address/postal-code/${cep}`)
}
