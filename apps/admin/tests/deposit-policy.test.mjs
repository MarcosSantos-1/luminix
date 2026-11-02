import assert from 'node:assert/strict'
import test from 'node:test'
import {
  depositProblem,
  depositSummary,
  normalizeLegacyDepositScope,
  serviceNeedsDeposit,
  setServicesDeposit,
  withDepositEnabled,
} from '../components/onboarding/deposit-policy.ts'

const service = {
  priceCents: 30000,
  priceType: 'fixed',
  bookingMode: 'instant',
  depositRequired: true,
}
test('old drafts and disabled deposits do not charge selected services', () => {
  assert.equal(serviceNeedsDeposit(service, {}), false)
  assert.equal(serviceNeedsDeposit(service, { depositScope: 'none' }), false)
  assert.equal(
    serviceNeedsDeposit({ ...service, bookingMode: 'manual_release' }, { depositScope: 'none' }),
    false,
  )
})
test('a selection follows each service, including special treatments', () => {
  assert.equal(serviceNeedsDeposit(service, { depositScope: 'selected' }), true)
  assert.equal(
    serviceNeedsDeposit({ ...service, depositRequired: false }, { depositScope: 'selected' }),
    false,
  )
  assert.equal(
    serviceNeedsDeposit(
      { ...service, depositRequired: false, bookingMode: 'manual_release' },
      { depositScope: 'selected' },
    ),
    false,
  )
})
test('legacy scopes still resolve as before', () => {
  assert.equal(serviceNeedsDeposit(service, { depositScope: 'special' }), false)
  assert.equal(serviceNeedsDeposit(service, { depositScope: 'all' }), true)
  const preferences = { depositScope: 'threshold', depositThresholdCents: 30000 }
  assert.equal(serviceNeedsDeposit(service, preferences), false)
  assert.equal(serviceNeedsDeposit({ ...service, priceCents: 30001 }, preferences), true)
  for (const priceType of ['from', 'quote'])
    assert.equal(
      serviceNeedsDeposit({ ...service, priceCents: 50000, priceType }, preferences),
      false,
    )
})
test('legacy scopes become an explicit selection with the same services', () => {
  const payload = {
    preferences: { depositScope: 'threshold', depositThresholdCents: 30000, depositPercent: 25 },
    services: [
      { ...service, id: 'cheap', priceCents: 10000, depositRequired: true },
      { ...service, id: 'laser', priceCents: 50000, depositRequired: false },
      { ...service, id: 'quote', priceType: 'quote', priceCents: 0, depositRequired: false },
    ],
  }
  const next = normalizeLegacyDepositScope(payload)
  assert.equal(next.preferences.depositScope, 'selected')
  assert.equal(next.preferences.depositPercent, 25)
  assert.deepEqual(
    next.services.map((item) => item.depositRequired),
    [false, true, false],
  )
  assert.equal(payload.preferences.depositScope, 'threshold')
})
test('normalization leaves disabled and explicit selections untouched', () => {
  const off = { preferences: { depositScope: 'none' }, services: [{ ...service }] }
  assert.equal(normalizeLegacyDepositScope(off), off)
  const on = { preferences: { depositScope: 'selected' }, services: [{ ...service }] }
  assert.equal(normalizeLegacyDepositScope(on), on)
})
test('turning the deposit on pre-marks specials only when nothing was chosen', () => {
  const fresh = {
    preferences: { depositScope: 'none' },
    services: [
      { ...service, id: 'laser', bookingMode: 'manual_release', depositRequired: false },
      { ...service, id: 'nails', depositRequired: false },
    ],
  }
  const on = withDepositEnabled(fresh, true)
  assert.equal(on.preferences.depositScope, 'selected')
  assert.deepEqual(
    on.services.map((item) => item.depositRequired),
    [true, false],
  )
  assert.equal(on.preferences.depositPercent, undefined)
  const edited = setServicesDeposit(on, ['laser'], false)
  const off = withDepositEnabled(edited, false)
  assert.equal(off.preferences.depositScope, 'none')
  const again = withDepositEnabled(setServicesDeposit(off, ['nails'], true), true)
  assert.deepEqual(
    again.services.map((item) => item.depositRequired),
    [false, true],
  )
})
test('a deposit needs a chosen percentage and at least one service', () => {
  const base = {
    preferences: { depositScope: 'selected' },
    services: [{ ...service, id: 'a', depositRequired: false }],
  }
  assert.equal(depositProblem({ ...base, preferences: { depositScope: 'none' } }), null)
  assert.equal(depositProblem(base).field, 'depositPercent')
  const withPercent = { ...base, preferences: { depositScope: 'selected', depositPercent: 20 } }
  assert.equal(depositProblem(withPercent).field, 'depositServices')
  assert.equal(depositProblem(setServicesDeposit(withPercent, ['a'], true)), null)
  assert.match(depositSummary(base), /Percentual a definir/)
})
test('review counts deposits, specials and free bookings', () => {
  const summary = depositSummary({
    preferences: { depositScope: 'selected', depositPercent: 30 },
    services: [
      { name: 'Laser', bookingMode: 'manual_release', depositRequired: true },
      { name: 'Limpeza', bookingMode: 'instant', depositRequired: true },
      { name: 'Unhas', bookingMode: 'instant' },
    ],
  })
  assert.match(summary, /30% de sinal em 2 serviços \(1 especial\)/)
  assert.match(summary, /reserva gratuita/)
  assert.match(summary, /Cobrança ainda não ativada/)
  assert.match(depositSummary({ preferences: { depositScope: 'none' }, services: [] }), /Sem sinal/)
  assert.match(
    depositSummary({
      preferences: { depositScope: 'selected' },
      services: [{ name: 'Laser', bookingMode: 'manual_release', depositRequired: true }],
    }),
    /em 1 serviço especial,/,
  )
})
