import assert from 'node:assert/strict'
import test from 'node:test'
import {
  attendancePercent,
  applyServicePolicies,
  filterPolicyServices,
  retentionScope,
  retentionScopeLabel,
  serviceRetentionSummary,
  withRetentionScope,
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

test('old drafts and custom percentages reopen in their effective scope', () => {
  assert.equal(retentionScope({ preferences: {}, services: [] }), 'none')
  assert.equal(retentionScope({ preferences: { noShowRetentionPercent: 37 }, services: [] }), 'all')
  const payload = { preferences: {}, services: [{ noShowRetentionPercent: 17 }] }
  assert.equal(retentionScope(payload), 'services')
  assert.match(retentionScopeLabel(payload), /somente em serviços específicos/)
  assert.equal(retentionScope(JSON.parse(JSON.stringify(payload))), 'services')
})

test('specific-service scope removes the general fee without affecting service exceptions or deadlines', () => {
  const payload = {
    preferences: {
      noShowRetentionPercent: 50,
      lateChangeRetentionPercent: 20,
      cancellationHours: 4,
    },
    services: [
      { id: 'laser', cancellationHours: 48, noShowRetentionPercent: 25 },
      { id: 'hair', noShowRetentionPercent: null },
      { id: 'free', noShowRetentionPercent: 0 },
    ],
  }
  const next = withRetentionScope(payload, 'services')
  assert.equal(retentionScope(next), 'services')
  assert.equal(attendancePercent(next.preferences, next.services[0], 'noShowRetentionPercent'), 25)
  assert.equal(attendancePercent(next.preferences, next.services[1], 'noShowRetentionPercent'), 0)
  assert.equal(attendancePercent(next.preferences, next.services[2], 'noShowRetentionPercent'), 0)
  assert.equal(next.preferences.lateChangeRetentionPercent, 0)
  assert.equal(next.services[0].cancellationHours, 48)
  assert.equal(next.preferences.cancellationHours, 4)
  assert.equal(payload.preferences.noShowRetentionPercent, 50)
})

test('no retention clears all monetary exceptions but preserves unrelated onboarding data', () => {
  const payload = {
    name: 'Clínica A',
    preferences: { noShowRetentionPercent: 50, acceptInApp: true, specialCancellationHours: 48 },
    services: [
      {
        id: 'laser',
        priceCents: 20000,
        cancellationHours: 72,
        lateChangeRetentionPercent: 25,
        noShowRetentionPercent: 100,
      },
    ],
  }
  const next = withRetentionScope(payload, 'none')
  assert.equal(retentionScope(next), 'none')
  assert.equal(next.services[0].noShowRetentionPercent, null)
  assert.equal(next.services[0].lateChangeRetentionPercent, null)
  assert.equal(next.services[0].cancellationHours, 72)
  assert.equal(next.services[0].priceCents, 20000)
  assert.equal(next.preferences.acceptInApp, true)
  assert.equal(next.name, 'Clínica A')
  assert.equal(payload.services[0].noShowRetentionPercent, 100)
  assert.equal(retentionScope(withRetentionScope(next, 'all')), 'none')
})

test('opening the general editor never invents fees and preserves explicit exemptions', () => {
  const payload = {
    preferences: { noShowRetentionPercent: 37 },
    services: [{ noShowRetentionPercent: 0 }],
  }
  assert.deepEqual(withRetentionScope(payload, 'all'), payload)
  assert.equal(
    attendancePercent(payload.preferences, payload.services[0], 'noShowRetentionPercent'),
    0,
  )
  assert.equal(retentionScope(withRetentionScope({ preferences: {}, services: [] }, 'all')), 'none')
})

test('review includes the service cancellation deadline, including zero', () => {
  assert.match(serviceRetentionSummary({ name: 'Laser', cancellationHours: 48 }, {}), /48h antes/)
  assert.match(serviceRetentionSummary({ name: 'Laser', cancellationHours: 0 }, {}), /0h antes/)
  assert.doesNotMatch(
    serviceRetentionSummary({ name: 'Laser', cancellationHours: null }, {}),
    /Prazo próprio/,
  )
})

test('a laser exception distinguishes late changes from absence and retains its own terms', () => {
  const preferences = { lateChangeRetentionPercent: 0, noShowRetentionPercent: 0 }
  const service = { name: 'Laser', lateChangeRetentionPercent: 25, noShowRetentionPercent: 0 }
  assert.match(serviceRetentionSummary(service, preferences), /alteração tardia — Reter 25%/)
  assert.match(serviceRetentionSummary(service, preferences), /falta — Sem retenção/)
  assert.equal(attendancePercent(preferences, service, 'lateChangeRetentionPercent'), 25)
})

test('bulk edits change only selected services and explicit fields, including special treatments', () => {
  const payload = {
    preferences: { noShowRetentionPercent: 30 },
    services: [
      {
        id: 'laser',
        name: 'Laser',
        bookingMode: 'manual_release',
        cancellationHours: 48,
        lateChangeRetentionPercent: 17,
        noShowRetentionPercent: null,
        priceCents: 20000,
      },
      {
        id: 'hair',
        name: 'Cabelo',
        bookingMode: 'instant',
        cancellationHours: 4,
        lateChangeRetentionPercent: 0,
        noShowRetentionPercent: 25,
      },
      { id: 'other', noShowRetentionPercent: 50 },
    ],
  }
  const next = applyServicePolicies(payload, ['laser', 'hair', 'unknown'], {
    noShowRetentionPercent: 0,
  })
  assert.equal(next.services[0].noShowRetentionPercent, 0)
  assert.equal(next.services[1].noShowRetentionPercent, 0)
  assert.equal(next.services[2], payload.services[2])
  assert.equal(next.services[0].cancellationHours, 48)
  assert.equal(next.services[1].cancellationHours, 4)
  assert.equal(next.services[0].lateChangeRetentionPercent, 17)
  assert.equal(next.services[0].priceCents, 20000)
  assert.equal(next.preferences, payload.preferences)
  assert.equal(payload.services[0].noShowRetentionPercent, null)
  const inherited = applyServicePolicies(next, ['laser'], { noShowRetentionPercent: null })
  assert.equal(
    attendancePercent(inherited.preferences, inherited.services[0], 'noShowRetentionPercent'),
    30,
  )
  assert.deepEqual(applyServicePolicies(payload, [], { cancellationHours: 24 }), payload)
})

test('search includes accents, category and rental equipment without excluding specials', () => {
  const services = [
    {
      id: 'special',
      name: 'Depilação a laser',
      category: 'Estética',
      resourceName: 'Aparelho Órion',
      bookingMode: 'manual_release',
      noShowRetentionPercent: 0,
    },
    {
      id: 'normal',
      name: 'Limpeza de pele',
      category: 'Estética',
      resourceName: '',
      bookingMode: 'instant',
      cancellationHours: 0,
    },
    { id: 'plain', name: 'Corte', category: 'Cabelo', resourceName: '', bookingMode: 'instant' },
  ]
  assert.deepEqual(filterPolicyServices(services, '', 'all'), services)
  assert.deepEqual(
    filterPolicyServices(services, 'DEPILACAO', 'all').map((s) => s.id),
    ['special'],
  )
  assert.deepEqual(
    filterPolicyServices(services, 'orion', 'special').map((s) => s.id),
    ['special'],
  )
  assert.equal(filterPolicyServices(services, 'estetica', 'all').length, 2)
  assert.deepEqual(
    filterPolicyServices(services, '', 'overrides').map((s) => s.id),
    ['special', 'normal'],
  )
  assert.deepEqual(filterPolicyServices(services, 'corte', 'special'), [])
})
