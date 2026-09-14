import { describe, expect, it } from 'vitest'

import { createDatabasePool } from '../src/shared/database/pool.js'
import { readFirebaseAdminConfig } from '../src/shared/integrations/firebase/admin.js'
import { readR2Config } from '../src/shared/integrations/r2/client.js'
import { createStripeClient } from '../src/shared/integrations/stripe/client.js'

describe('integration configuration', () => {
  it('requires a database URL', () => {
    expect(() => createDatabasePool({})).toThrow('DATABASE_URL não configurada')
  })

  it('rejects an invalid pool size before connecting', () => {
    expect(() =>
      createDatabasePool({
        DATABASE_POOL_MAX: '0',
        DATABASE_URL: 'postgresql://localhost/luminix',
      }),
    ).toThrow('DATABASE_POOL_MAX deve ser um inteiro entre 1 e 50')
  })

  it('rejects a live Stripe key outside production', () => {
    expect(() =>
      createStripeClient({
        NODE_ENV: 'development',
        STRIPE_SECRET_KEY: 'sk_live_not-a-real-key',
      }),
    ).toThrow('Ambientes não produtivos exigem uma chave Stripe de teste')
  })

  it('requires the Firebase project id', () => {
    expect(() => readFirebaseAdminConfig({})).toThrow('FIREBASE_PROJECT_ID não configurado')
  })

  it('rejects incomplete inline Firebase credentials', () => {
    expect(() =>
      readFirebaseAdminConfig({
        FIREBASE_CLIENT_EMAIL: 'firebase-admin@example.test',
        FIREBASE_PROJECT_ID: 'luminix-test',
      }),
    ).toThrow('FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY devem ser configuradas juntas')
  })

  it('requires all R2 S3 settings', () => {
    expect(() => readR2Config({})).toThrow('R2_ACCESS_KEY_ID')
  })

  it('rejects an R2 endpoint containing the bucket path', () => {
    expect(() =>
      readR2Config({
        R2_ACCESS_KEY_ID: 'access-key',
        R2_BUCKET: 'luminix',
        R2_ENDPOINT: 'https://account.r2.cloudflarestorage.com/luminix',
        R2_SECRET_ACCESS_KEY: 'secret-key',
      }),
    ).toThrow('R2_ENDPOINT deve usar HTTPS e não deve incluir o nome do bucket no caminho')
  })
})
