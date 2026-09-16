// Fixed upstream: request input cannot select an API host or tenant.
export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'no-store' }
  const authorization = request.headers.get('authorization') ?? ''
  if (!/^Bearer [^\s,]{1,8192}$/i.test(authorization)) {
    return Response.json({ error: 'Authentication required' }, { status: 401, headers })
  }
  try {
    const base = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL
    if (!base) throw new Error('API unavailable')
    const url = new URL('/auth/session', base)
    if (
      url.protocol !== 'https:' &&
      !(process.env.NODE_ENV !== 'production' && url.hostname === 'localhost')
    ) {
      throw new Error('Invalid API URL')
    }
    const response = await fetch(url, {
      headers: { authorization },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      const status = [401, 403, 429].includes(response.status) ? response.status : 503
      return Response.json({ error: 'Session unavailable' }, { status, headers })
    }
    const data = await response.json()
    if (typeof data?.identity?.id !== 'string') throw new Error('Invalid response')
    return Response.json({ identity: { id: data.identity.id } }, { headers })
  } catch {
    return Response.json({ error: 'Session unavailable' }, { status: 503, headers })
  }
}
