// Public: "receber link de acesso" on the login page. Fixed upstream and a closed body shape;
// the API answers the same way whether or not the account exists.
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' }
  try {
    const input = (await request.json().catch(() => null)) as { email?: unknown } | null
    const email = typeof input?.email === 'string' ? input.email.trim() : ''
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
      return Response.json({ error: 'Invalid email' }, { status: 400, headers })
    const base = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL
    if (!base) throw new Error('API unavailable')
    const url = new URL('/auth/access-link', base)
    if (
      url.protocol !== 'https:' &&
      !(process.env.NODE_ENV !== 'production' && url.hostname === 'localhost')
    )
      throw new Error('Invalid API URL')
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    })
    if (response.ok) return Response.json({ sent: true }, { status: 202, headers })
    const status = [400, 429].includes(response.status) ? response.status : 503
    return Response.json({ error: 'Link unavailable' }, { status, headers })
  } catch {
    return Response.json({ error: 'Link unavailable' }, { status: 503, headers })
  }
}
