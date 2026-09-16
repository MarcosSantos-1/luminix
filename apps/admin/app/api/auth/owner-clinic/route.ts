export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' }
  const authorization = request.headers.get('authorization') ?? ''
  if (!/^Bearer [^\s,]{1,8192}$/i.test(authorization)) {
    return Response.json({ error: 'Authentication required' }, { status: 401, headers })
  }
  try {
    // Parse bounded JSON without forwarding arbitrary identity/clinic/role fields.
    const reader = request.body?.getReader()
    if (!reader) return Response.json({ error: 'Invalid body' }, { status: 400, headers })
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 2048) {
        await reader.cancel()
        return Response.json({ error: 'Invalid body' }, { status: 413, headers })
      }
      chunks.push(value)
    }
    let body: { name?: unknown }
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {
      return Response.json({ error: 'Invalid body' }, { status: 400, headers })
    }
    if (
      !body ||
      typeof body !== 'object' ||
      Object.keys(body).some((key) => key !== 'name') ||
      typeof body.name !== 'string' ||
      !body.name.trim() ||
      body.name.length > 160
    ) {
      return Response.json({ error: 'Invalid body' }, { status: 400, headers })
    }
    const base = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL
    if (!base) throw new Error('API unavailable')
    const url = new URL('/auth/owner-clinic', base)
    if (
      url.protocol !== 'https:' &&
      !(process.env.NODE_ENV !== 'production' && url.hostname === 'localhost')
    )
      throw new Error('Invalid API URL')
    const response = await fetch(url, {
      method: 'POST',
      headers: { authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: body.name.trim() }),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      const status = [400, 401, 403, 409, 429].includes(response.status) ? response.status : 503
      return Response.json({ error: 'Clinic creation unavailable' }, { status, headers })
    }
    const data = await response.json()
    if (
      typeof data?.clinic?.id !== 'string' ||
      typeof data.clinic.name !== 'string' ||
      typeof data.clinic.slug !== 'string' ||
      !['draft', 'active'].includes(data.clinic.status)
    )
      throw new Error('Invalid response')
    return Response.json(
      {
        clinic: {
          id: data.clinic.id,
          name: data.clinic.name,
          slug: data.clinic.slug,
          status: data.clinic.status,
        },
      },
      { status: response.status, headers },
    )
  } catch {
    return Response.json({ error: 'Clinic creation unavailable' }, { status: 503, headers })
  }
}
