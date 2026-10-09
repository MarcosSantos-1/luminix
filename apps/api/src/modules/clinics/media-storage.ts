import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { createR2Client, readR2Config } from '../../shared/integrations/r2/client.js'

export type MediaKind = 'clinic_logo' | 'professional_photo'
export type MediaVariant = 'small' | 'large'

const dimensions: Record<MediaVariant, number> = { small: 128, large: 512 }

export function mediaObjectKey(
  clinicId: string,
  assetId: string,
  kind: MediaKind,
  subjectRef: string | null,
  variant: MediaVariant,
) {
  const module = kind === 'clinic_logo' ? 'branding/logo' : `team/${subjectRef}`
  return `${clinicId}/${module}/${assetId}/${variant}-${dimensions[variant]}.webp`
}

export function readWebpDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (
    buffer.length < 30 ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WEBP'
  )
    return null
  const chunk = buffer.toString('ascii', 12, 16)
  if (chunk === 'VP8X') {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    }
  }
  if (chunk === 'VP8L' && buffer[20] === 0x2f) {
    return {
      width: 1 + (buffer[21] | ((buffer[22] & 0x3f) << 8)),
      height: 1 + ((buffer[22] >> 6) | (buffer[23] << 2) | ((buffer[24] & 0x0f) << 10)),
    }
  }
  if (chunk === 'VP8 ' && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff }
  }
  return null
}

export async function uploadMediaVariant(options: {
  clinicId: string
  assetId: string
  kind: MediaKind
  subjectRef: string | null
  variant: MediaVariant
  body: Buffer
}) {
  const expected = dimensions[options.variant]
  const detected = readWebpDimensions(options.body.subarray(0, 64))
  if (!detected || detected.width !== expected || detected.height !== expected)
    throw Object.assign(new Error('Invalid WebP variant'), { statusCode: 400 })
  const config = readR2Config()
  const key = mediaObjectKey(
    options.clinicId,
    options.assetId,
    options.kind,
    options.subjectRef,
    options.variant,
  )
  await createR2Client().send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: options.body,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable',
      Metadata: { asset: options.assetId, variant: options.variant },
    }),
  )
  return { key, bytes: options.body.byteLength, width: detected.width, height: detected.height }
}

export async function verifyMediaVariants(options: {
  clinicId: string
  assetId: string
  kind: MediaKind
  subjectRef: string | null
}) {
  const config = readR2Config()
  const client = createR2Client()
  const result = {} as Record<MediaVariant, { key: string; bytes: number }>
  for (const variant of ['small', 'large'] as const) {
    const key = mediaObjectKey(
      options.clinicId,
      options.assetId,
      options.kind,
      options.subjectRef,
      variant,
    )
    const head = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }))
    if (head.ContentType !== 'image/webp' || !head.ContentLength)
      throw Object.assign(new Error('Incomplete media upload'), { statusCode: 409 })
    const object = await client.send(
      new GetObjectCommand({ Bucket: config.bucket, Key: key, Range: 'bytes=0-63' }),
    )
    const bytes = Buffer.from(await object.Body!.transformToByteArray())
    const detected = readWebpDimensions(bytes)
    if (
      !detected ||
      detected.width !== dimensions[variant] ||
      detected.height !== dimensions[variant]
    )
      throw Object.assign(new Error('Invalid media upload'), { statusCode: 400 })
    result[variant] = { key, bytes: Number(head.ContentLength) }
  }
  return result
}

export function publicMediaUrl(key: string) {
  const value = process.env.R2_PUBLIC_BASE_URL
  if (!value) throw new Error('R2_PUBLIC_BASE_URL is required')
  const base = new URL(value)
  if (base.protocol !== 'https:' || base.search || base.hash)
    throw new Error('R2_PUBLIC_BASE_URL must be an HTTPS origin')
  return `${base.toString().replace(/\/$/, '')}/${key}`
}
