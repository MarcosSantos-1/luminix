import assert from 'node:assert/strict'
import test from 'node:test'
import {
  categoryIntroduction,
  groupServices,
  publicLink,
  showcaseServices,
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
  assert.equal(groups.length, 4)
  assert.equal(groups[0].items.length, 2)
  assert.equal(groups[0].items[0].priceType, 'from')
  assert.notEqual(
    categoryIntroduction('Estética facial'),
    categoryIntroduction('Bem-estar corporal'),
  )
  assert.match(categoryIntroduction('Unhas'), /detalhes/)
  assert.deepEqual(groupServices([]), [])
})

test('showcase keeps the selected order and fills up to four with other categories', () => {
  const clinic = getPreviewClinic('demonstracao')!
  const featured = showcaseServices(clinic)
  assert.deepEqual(
    featured.map(({ id }) => id),
    ['demo-5', 'demo-6', 'demo-1', 'demo-3'],
  )
  assert.equal(
    new Set(showcaseServices({ ...clinic, featured: [] }).map(({ category }) => category)).size,
    4,
  )
  assert.deepEqual(showcaseServices({ ...clinic, services: [] }), [])
})
