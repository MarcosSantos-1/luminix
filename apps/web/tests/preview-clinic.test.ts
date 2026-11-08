import assert from 'node:assert/strict'
import test from 'node:test'

import {
  clinicCategories,
  dominantClinicCategory,
  serviceCategoryArt,
} from '../lib/clinic-categories.ts'
import { getPreviewClinic, previewThemeOverride } from '../lib/preview-clinic.ts'

test('exibe somente a fixture explicitamente demonstrativa', () => {
  assert.equal(getPreviewClinic('demonstracao')?.name, 'Clínica de demonstração')
})

test('não inventa clínicas nem aceita identificadores arbitrários', () => {
  for (const slug of ['espacovanessa', '', '__proto__', '../demonstracao', 'Demonstracao']) {
    assert.equal(getPreviewClinic(slug), null)
  }
})

test('demonstração de tatuagem abre em Grafite e oferece troca de tema apenas para demos', () => {
  const demo = getPreviewClinic('demonstracao-tatuagem')!
  assert.equal(demo.theme, 'grafite')
  const category = dominantClinicCategory(demo.services)!
  assert.equal(category, 'tatuagem')
  assert.equal(clinicCategories[category].hero, '/clinic/heroes/tatuagem.webp')
  assert.equal(serviceCategoryArt(demo.services[0]), '/clinic/categories/tatuagem.webp')
  assert.equal(previewThemeOverride(demo.slug, 'azul'), 'azul')
  assert.equal(previewThemeOverride(demo.slug, '../grafite'), null)
  assert.equal(previewThemeOverride('aa-1234', 'azul'), null)
})
