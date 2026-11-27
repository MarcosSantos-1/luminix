import assert from 'node:assert/strict'
import test from 'node:test'
import { remainingPlanDays } from '../lib/plan-days.ts'

const day = 86_400_000
const expires = Date.parse('2026-12-22T15:00:00Z')

test('counts down at daily boundaries and reaches zero at expiry', () => {
  assert.equal(remainingPlanDays(expires, expires - 12 * day), 12)
  assert.equal(remainingPlanDays(expires, expires - 11 * day - 1), 12)
  assert.equal(remainingPlanDays(expires, expires - 11 * day), 11)
  assert.equal(remainingPlanDays(expires, expires - 1), 1)
  assert.equal(remainingPlanDays(expires, expires), 0)
  assert.equal(remainingPlanDays(expires, expires + day), 0)
})

test('reports the actual expiry for an extended trial', () => {
  assert.equal(remainingPlanDays(expires, expires - 25 * day), 25)
})
