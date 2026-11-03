import assert from 'node:assert/strict'
import test from 'node:test'
import {
  categoryIntroduction,
  groupServices,
  publicLink,
  whatsappLink,
} from '../lib/public-clinic.ts'
import { getPreviewClinic } from '../lib/preview-clinic.ts'

test('public contact links accept only expected protocols and social destinations', () => {
  assert.equal(publicLink('@studio.bela', 'instagram'), 'https://www.instagram.com/studio.bela/')
  assert.equal(publicLink('https://instagram.com.evil.test/user', 'instagram'), null)
  assert.equal(publicLink('https://evil.test', 'facebook'), null)
  for (const value of [
    'javascript:alert(1)',
    'data:text/html,test',
    'https://user:password@example.com',
  ])
    assert.equal(publicLink(value, 'website'), null)
  assert.equal(publicLink('example.com', 'website'), 'https://example.com/')
  assert.equal(whatsappLink('+5511999999999'), 'https://wa.me/5511999999999')
  assert.equal(whatsappLink('javascript:alert(1)'), null)
})
test('categories preserve services, prices and distinct introductions without raw category IDs', () => {
  const groups = groupServices(getPreviewClinic('demonstracao')!.services)
  assert.equal(groups.length, 3)
  assert.equal(groups[0].items.length, 2)
  assert.equal(groups[0].items[0].priceType, 'from')
  assert.notEqual(
    categoryIntroduction('Estética facial'),
    categoryIntroduction('Bem-estar corporal'),
  )
  assert.match(categoryIntroduction('Unhas'), /detalhes/)
  assert.deepEqual(groupServices([]), [])
})
