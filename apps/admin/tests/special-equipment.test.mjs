import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  applyEquipment,
  configuredEquipment,
  suggestedEquipment,
} from '../components/onboarding/special-equipment.ts'

const service = (id, name, extra = {}) => ({
  id,
  name,
  category: 'Depilação',
  description: '',
  durationMinutes: 60,
  priceCents: 10000,
  priceType: 'fixed',
  bookingMode: 'instant',
  audience: 'all',
  sensitive: false,
  resourceName: '',
  cancellationHours: null,
  ...extra,
})

test('only suggests equipment for chosen services and groups laser areas', () => {
  const services = [
    service('a', 'Depilação a laser: axilas'),
    service('b', 'Depilação a laser: pernas'),
    service('c', 'Corte feminino'),
  ]
  assert.deepEqual(suggestedEquipment(services), [
    { name: 'Laser para depilação', serviceIds: ['a', 'b'] },
  ])
  assert.deepEqual(suggestedEquipment([service('d', 'Pressoterapia')]), [
    { name: 'Aparelho de pressoterapia', serviceIds: ['d'] },
  ])
  assert.deepEqual(suggestedEquipment([service('e', 'Depilação com cera: axilas')]), [])
})

test('saving shares one resource across services and preserves commercial and audience settings', () => {
  const services = [
    service('a', 'Laser axilas'),
    service('b', 'Laser íntimo', { audience: 'women', sensitive: true, cancellationHours: 48 }),
  ]
  const equipment = [{ name: 'Laser alugado', serviceIds: ['a', 'b'] }]
  const saved = applyEquipment(services, equipment)
  assert.equal(services[0].bookingMode, 'instant')
  assert.equal(saved[1].bookingMode, 'manual_release')
  assert.equal(saved[1].resourceName, 'Laser alugado')
  assert.equal(saved[1].priceCents, 10000)
  assert.equal(saved[1].audience, 'women')
  assert.equal(saved[1].sensitive, true)
  assert.equal(saved[1].cancellationHours, 48)
  assert.deepEqual(configuredEquipment(JSON.parse(JSON.stringify(saved))), equipment)
})

test('unselecting equipment restores only its services and leaves other booking modes alone', () => {
  const services = [
    service('a', 'Laser', { bookingMode: 'manual_release', resourceName: 'Laser alugado' }),
    service('b', 'Consulta', { bookingMode: 'request' }),
    service('c', 'Profissional convidado', { bookingMode: 'manual_release' }),
  ]
  const saved = applyEquipment(services, [])
  assert.equal(saved[0].bookingMode, 'instant')
  assert.equal(saved[0].resourceName, '')
  assert.equal(saved[1].bookingMode, 'request')
  assert.equal(saved[2].bookingMode, 'manual_release')
})

test('renames retain resource links by service id and removing a service drops orphan groups', () => {
  const equipment = [{ name: 'Meu aparelho', serviceIds: ['a'] }]
  const saved = applyEquipment([service('a', 'Nome alterado')], equipment)
  assert.deepEqual(configuredEquipment(saved), equipment)
  assert.deepEqual(configuredEquipment(saved.filter((item) => item.id !== 'a')), [])
})
