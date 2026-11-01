import assert from 'node:assert/strict'
import test from 'node:test'
import { serviceNeedsDeposit, depositSummary } from '../components/onboarding/deposit-policy.ts'

const service = {
  priceCents: 30000,
  priceType: 'fixed',
  bookingMode: 'instant',
  depositRequired: true,
}
test('old drafts and disabled deposits do not charge selected services', () => {
  assert.equal(serviceNeedsDeposit(service, {}), false)
  assert.equal(serviceNeedsDeposit(service, { depositScope: 'none' }), false)
})
test('deposit scopes distinguish selection, rented equipment and all services', () => {
  assert.equal(serviceNeedsDeposit(service, { depositScope: 'selected' }), true)
  assert.equal(
    serviceNeedsDeposit({ ...service, depositRequired: false }, { depositScope: 'selected' }),
    false,
  )
  assert.equal(serviceNeedsDeposit(service, { depositScope: 'special' }), false)
  assert.equal(
    serviceNeedsDeposit({ ...service, bookingMode: 'manual_release' }, { depositScope: 'special' }),
    true,
  )
  assert.equal(serviceNeedsDeposit(service, { depositScope: 'all' }), true)
})
test('above a threshold is strict and excludes prices awaiting agreement', () => {
  const preferences = { depositScope: 'threshold', depositThresholdCents: 30000 }
  assert.equal(serviceNeedsDeposit(service, preferences), false)
  assert.equal(serviceNeedsDeposit({ ...service, priceCents: 30001 }, preferences), true)
  for (const priceType of ['from', 'quote'])
    assert.equal(
      serviceNeedsDeposit({ ...service, priceCents: 50000, priceType }, preferences),
      false,
    )
})
test('review explains the selected treatments and the configuration boundary', () => {
  assert.match(
    depositSummary({
      preferences: { depositScope: 'selected', depositPercent: 30 },
      services: [{ name: 'Laser', depositRequired: true }, { name: 'Corte' }],
    }),
    /30% de sinal para Laser.*cobrança ainda não ativada/,
  )
})
