import Stripe from 'stripe'

export function createStripeClient(environment: NodeJS.ProcessEnv = process.env): Stripe {
  const secretKey = environment.STRIPE_SECRET_KEY

  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY não configurada')
  }

  if (environment.NODE_ENV !== 'production' && !secretKey.startsWith('sk_test_')) {
    throw new Error('Ambientes não produtivos exigem uma chave Stripe de teste')
  }

  return new Stripe(secretKey, {
    maxNetworkRetries: 2,
    timeout: 10_000,
  })
}
