import assert from 'node:assert/strict'
import test from 'node:test'
import {
  sinalOutcome,
  sinalOutcomeLabel,
  withSinalOutcome,
} from '../components/onboarding/attendance-policy.ts'

const base = { preferences: {}, services: [] }

test('old drafts without retention reopen as always refunding the deposit', () => {
  assert.equal(sinalOutcome(base), 'refund')
  assert.match(sinalOutcomeLabel(base), /Devolver sempre/)
})

test('each card maps to the late-change and no-show fields without stacking', () => {
  const noShow = withSinalOutcome(base, 'no_show')
  assert.equal(noShow.preferences.lateChangeRetentionPercent, 0)
  assert.equal(noShow.preferences.noShowRetentionPercent, 100)
  assert.equal(sinalOutcome(noShow), 'no_show')
  const both = withSinalOutcome(base, 'late_or_no_show')
  assert.equal(both.preferences.lateChangeRetentionPercent, 100)
  assert.equal(both.preferences.noShowRetentionPercent, 100)
  assert.equal(sinalOutcome(both), 'late_or_no_show')
  const refund = withSinalOutcome(both, 'refund')
  assert.equal(refund.preferences.noShowRetentionPercent, 0)
  assert.equal(sinalOutcome(refund), 'refund')
})

test('custom percentages and service exceptions are detected and preserved until a choice', () => {
  const percent = { preferences: { noShowRetentionPercent: 25 }, services: [] }
  assert.equal(sinalOutcome(percent), 'custom')
  assert.match(sinalOutcomeLabel(percent), /personalizada/)
  const exception = {
    preferences: {},
    services: [{ id: 'laser', noShowRetentionPercent: 50 }],
  }
  assert.equal(sinalOutcome(exception), 'custom')
  assert.equal(exception.services[0].noShowRetentionPercent, 50)
  const lateOnly = { preferences: { lateChangeRetentionPercent: 100 }, services: [] }
  assert.equal(sinalOutcome(lateOnly), 'custom')
})

test('an exception equal to the general rule is not custom', () => {
  const payload = {
    preferences: { noShowRetentionPercent: 100 },
    services: [{ id: 'laser', noShowRetentionPercent: 100, lateChangeRetentionPercent: null }],
  }
  assert.equal(sinalOutcome(payload), 'no_show')
})

test('choosing a card clears per-service retention but keeps deadlines and other data', () => {
  const payload = {
    name: 'Clínica A',
    preferences: { noShowRetentionPercent: 50, acceptInApp: true, cancellationHours: 4 },
    services: [
      {
        id: 'laser',
        priceCents: 20000,
        cancellationHours: 72,
        lateChangeRetentionPercent: 25,
        noShowRetentionPercent: 0,
      },
      { id: 'nails', cancellationHours: null },
    ],
  }
  const next = withSinalOutcome(payload, 'no_show')
  assert.equal(next.services[0].lateChangeRetentionPercent, null)
  assert.equal(next.services[0].noShowRetentionPercent, null)
  assert.equal(next.services[0].cancellationHours, 72)
  assert.equal(next.services[0].priceCents, 20000)
  assert.equal(next.services[1], payload.services[1])
  assert.equal(next.preferences.acceptInApp, true)
  assert.equal(next.preferences.cancellationHours, 4)
  assert.equal(next.name, 'Clínica A')
  assert.equal(payload.services[0].lateChangeRetentionPercent, 25)
})
