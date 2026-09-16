// Fixed route allowlist; input cannot choose a host, identity, permission or arbitrary API path.
export async function staffApiGet(
  request: Request,
  path: '/auth/clinics' | `/clinics/${string}/context` | `/clinics/${string}/settings`,
) {
  const headers = { 'Cache-Control': 'no-store' }
  const authorization = request.headers.get('authorization') ?? ''
  if (!/^Bearer [^\s,]{1,8192}$/i.test(authorization))
    return Response.json({ error: 'Authentication required' }, { status: 401, headers })
  try {
    const base = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL
    if (!base) throw new Error('API unavailable')
    const url = new URL(path, base)
    if (
      url.protocol !== 'https:' &&
      !(process.env.NODE_ENV !== 'production' && url.hostname === 'localhost')
    )
      throw new Error('Invalid API URL')
    if (path === '/auth/clinics') {
      const after = new URL(request.url).searchParams.get('after')
      if (after) {
        if (!/^[0-9a-f-]{36}$/i.test(after))
          return Response.json({ error: 'Invalid cursor' }, { status: 400, headers })
        url.searchParams.set('after', after)
      }
    }
    const response = await fetch(url, {
      headers: { authorization },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      return Response.json(
        { error: 'Access unavailable' },
        { status: [400, 401, 403, 429].includes(response.status) ? response.status : 503, headers },
      )
    }
    return Response.json(await response.json(), { headers })
  } catch {
    return Response.json({ error: 'API unavailable' }, { status: 503, headers })
  }
}
