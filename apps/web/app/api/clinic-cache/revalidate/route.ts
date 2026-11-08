import { timingSafeEqual } from 'node:crypto'
import { revalidateTag } from 'next/cache'
import { isPublicClinicSlug, publicClinicTag } from '../../../../lib/public-clinic-cache'

export async function POST(request: Request) {
  const secret = process.env.CLINIC_CACHE_SECRET
  const received = Buffer.from(request.headers.get('Authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  if (!secret || received.length !== expected.length || !timingSafeEqual(received, expected))
    return new Response(null, { status: 401 })

  const payload = await request.json().catch(() => null)
  if (!isPublicClinicSlug(payload?.slug)) return new Response(null, { status: 400 })

  revalidateTag(publicClinicTag(payload.slug), { expire: 0 })
  return new Response(null, { status: 204 })
}
