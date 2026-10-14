import { staffApiGet } from '@/lib/staff-api-proxy'

const limits: Record<string, number> = {
  line: 240,
  number: 20,
  district: 120,
  city: 120,
  state: 2,
  postalCode: 9,
}

export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'no-store' }
  const source = new URL(request.url).searchParams
  const query: Record<string, string> = {}
  for (const [key, max] of Object.entries(limits)) {
    const value = source.get(key)?.trim() ?? ''
    if (value.length > max)
      return Response.json({ error: 'Invalid address' }, { status: 400, headers })
    if (value) query[key] = value
  }
  if (!query.line || query.line.length < 3)
    return Response.json({ error: 'Invalid address' }, { status: 400, headers })
  const postalCode = (query.postalCode ?? '').replace(/\D/g, '')
  if ((query.city?.length ?? 0) < 2 && postalCode.length !== 8)
    return Response.json({ error: 'Incomplete address' }, { status: 400, headers })
  if (query.state && !/^[A-Za-z]{2}$/.test(query.state))
    return Response.json({ error: 'Invalid state' }, { status: 400, headers })
  return staffApiGet(request, '/address/geocode', { query })
}
