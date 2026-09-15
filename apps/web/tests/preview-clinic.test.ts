import assert from 'node:assert/strict'
import test from 'node:test'

import { getPreviewClinic } from '../lib/preview-clinic.ts'

test('exibe somente a fixture explicitamente demonstrativa', () => {
  assert.equal(getPreviewClinic('demonstracao')?.name, 'Clínica de demonstração')
})

test('não inventa clínicas nem aceita identificadores arbitrários', () => {
  for (const slug of ['espacovanessa', '', '__proto__', '../demonstracao', 'Demonstracao']) {
    assert.equal(getPreviewClinic(slug), null)
  }
})
