import assert from 'node:assert/strict'
import test from 'node:test'
import {
  attendancePercent,
  serviceRetentionSummary,
} from '../components/onboarding/attendance-policy.ts'

test('an explicit free service stays free when the space retains prepaid amounts', () => {
  const preferences = { lateChangeRetentionPercent: 25, noShowRetentionPercent: 50 }
  assert.equal(
    attendancePercent(preferences, { lateChangeRetentionPercent: 0 }, 'lateChangeRetentionPercent'),
    0,
  )
  assert.equal(
    attendancePercent(
      preferences,
      { lateChangeRetentionPercent: null },
      'lateChangeRetentionPercent',
    ),
    25,
  )
  assert.equal(attendancePercent(preferences, {}, 'noShowRetentionPercent'), 50)
  assert.equal(attendancePercent({}, undefined, 'noShowRetentionPercent'), 0)
})

test('a laser exception distinguishes late changes from absence and retains its own terms', () => {
  const preferences = { lateChangeRetentionPercent: 0, noShowRetentionPercent: 0 }
  const service = { name: 'Laser', lateChangeRetentionPercent: 25, noShowRetentionPercent: 0 }
  assert.match(serviceRetentionSummary(service, preferences), /alteração tardia — Reter 25%/)
  assert.match(serviceRetentionSummary(service, preferences), /falta — Sem retenção/)
  assert.equal(attendancePercent(preferences, service, 'lateChangeRetentionPercent'), 25)
})
