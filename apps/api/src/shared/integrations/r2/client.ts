import { S3Client } from '@aws-sdk/client-s3'

export type R2Config = {
  accessKeyId: string
  bucket: string
  endpoint: string
  secretAccessKey: string
}

export function readR2Config(environment: NodeJS.ProcessEnv = process.env): R2Config {
  const accessKeyId = environment.R2_ACCESS_KEY_ID
  const bucket = environment.R2_BUCKET
  const endpoint = environment.R2_ENDPOINT
  const secretAccessKey = environment.R2_SECRET_ACCESS_KEY

  if (!accessKeyId || !bucket || !endpoint || !secretAccessKey) {
    throw new Error(
      'R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET e R2_ENDPOINT são obrigatórios',
    )
  }

  const endpointUrl = new URL(endpoint)

  if (endpointUrl.protocol !== 'https:' || endpointUrl.pathname !== '/') {
    throw new Error('R2_ENDPOINT deve usar HTTPS e não deve incluir o nome do bucket no caminho')
  }

  return { accessKeyId, bucket, endpoint, secretAccessKey }
}

export function createR2Client(environment: NodeJS.ProcessEnv = process.env): S3Client {
  const config = readR2Config(environment)

  return new S3Client({
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    endpoint: config.endpoint,
    region: 'auto',
  })
}

/**
 * Private bucket for the media library (client photos, before/after). It must NOT have public
 * access enabled; files are read only through short-lived signed URLs. Credentials default to
 * the main token, which then needs Object Read & Write on this bucket too.
 */
export function readPrivateR2Config(environment: NodeJS.ProcessEnv = process.env): R2Config | null {
  const bucket = environment.R2_PRIVATE_BUCKET
  if (!bucket) return null
  const base = readR2Config(environment)
  if (bucket === base.bucket)
    throw new Error('R2_PRIVATE_BUCKET must differ from the public bucket')
  return {
    ...base,
    bucket,
    accessKeyId: environment.R2_PRIVATE_ACCESS_KEY_ID ?? base.accessKeyId,
    secretAccessKey: environment.R2_PRIVATE_SECRET_ACCESS_KEY ?? base.secretAccessKey,
  }
}

export function createR2ClientFor(config: R2Config): S3Client {
  return new S3Client({
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    endpoint: config.endpoint,
    region: 'auto',
  })
}
