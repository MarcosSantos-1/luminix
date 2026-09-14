import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'

import { createStripeClient } from '../src/shared/integrations/stripe/client.js'

if (existsSync('.env')) {
  loadEnvFile('.env')
}

const stripe = createStripeClient()
const account = await stripe.accounts.retrieve(null)

console.log(`Stripe test API: conexão validada para a conta ${account.id}`)
