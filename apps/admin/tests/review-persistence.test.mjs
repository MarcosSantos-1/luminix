import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hasDraftChanges } from '../components/onboarding/review-persistence.ts'

test('a completion retry ignores JSONB key order and omitted optional fields', () => {
  assert.equal(
    hasDraftChanges(
      {
        name: 'Clínica',
        preferences: { cancellationHours: 12, reschedulingHours: null, note: undefined },
      },
      { preferences: { reschedulingHours: null, cancellationHours: 12 }, name: 'Clínica' },
    ),
    false,
  )
})
test('edits made before returning directly to review must be persisted', () => {
  const saved = {
    services: [{ id: 'a', priceCents: 1000 }],
    preferences: { clientInstructions: 'Olá' },
  }
  assert.equal(
    hasDraftChanges({ ...saved, services: [{ id: 'a', priceCents: 1500 }] }, saved),
    true,
  )
  assert.equal(hasDraftChanges({ ...saved, preferences: { clientInstructions: '' } }, saved), true)
})
