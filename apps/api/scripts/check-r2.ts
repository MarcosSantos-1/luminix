import { ListObjectsV2Command } from '@aws-sdk/client-s3'
import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'

import { createR2Client, readR2Config } from '../src/shared/integrations/r2/client.js'

if (existsSync('.env')) {
  loadEnvFile('.env')
}

const config = readR2Config()
const result = await createR2Client().send(
  new ListObjectsV2Command({ Bucket: config.bucket, MaxKeys: 1 }),
)

console.log(
  `R2 S3: credenciais validadas; bucket acessível (${result.KeyCount ?? 0} objeto(s) amostrado(s))`,
)
