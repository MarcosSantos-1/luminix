import assert from 'node:assert/strict'
import test from 'node:test'

import { dayKey, slotsFor } from '../lib/client-app/format.ts'
import { searchDemoSpaces, slugFromQuery, summarizeSpace } from '../lib/client-app/summary.ts'
import { getPreviewClinic } from '../lib/preview-clinic.ts'

test('código, endereço colado e slug viram o mesmo candidato de busca', () => {
  assert.equal(slugFromQuery('KW-4374'), 'kw-4374')
  assert.equal(slugFromQuery('https://luminix.beauty/c/espaco-vanessa?x=1'), 'espaco-vanessa')
  assert.equal(slugFromQuery('DEMO-TATUAGEM'), 'demonstracao-tatuagem')
  assert.equal(slugFromQuery('Traço & Sombra'), null)
  assert.equal(slugFromQuery('../demonstracao'), null)
})

test('busca por nome cobre apenas demonstrações e ignora acentos', () => {
  assert.deepEqual(
    searchDemoSpaces('traco').map((space) => space.slug),
    ['demonstracao-tatuagem'],
  )
  assert.deepEqual(searchDemoSpaces('t'), [])
  assert.deepEqual(searchDemoSpaces('espaco-inexistente'), [])
})

test('resumo do espaço não carrega serviços nem contatos', () => {
  const summary = summarizeSpace(getPreviewClinic('demonstracao-tatuagem')!)
  assert.deepEqual(Object.keys(summary).sort(), [
    'address',
    'category',
    'city',
    'code',
    'demo',
    'logoUrl',
    'name',
    'slug',
    'theme',
  ])
  assert.equal(summary.theme, 'grafite')
  assert.equal(summary.code, 'DEMO-TATUAGEM')
})

test('horários respeitam expediente, duração, dia fechado e reservas já feitas', () => {
  const day = new Date(2099, 0, 5) // segunda-feira
  const hours = [{ weekday: 1, available: true, periods: [{ start: '09:00', end: '11:00' }] }]
  assert.deepEqual(slotsFor(day, hours, 60, new Set()), ['09:00', '09:30', '10:00'])
  assert.deepEqual(slotsFor(day, hours, 60, new Set([`${dayKey(day)}T09:30`])), ['09:00', '10:00'])
  assert.deepEqual(slotsFor(new Date(2099, 0, 6), hours, 60, new Set()), [])
  // Sem expediente publicado: padrão seg–sáb, domingo fechado.
  assert.equal(slotsFor(new Date(2099, 0, 4), [], 30, new Set()).length, 0)
  assert.equal(slotsFor(day, [], 30, new Set())[0], '09:00')
  // Dias passados nunca oferecem horário.
  assert.deepEqual(slotsFor(new Date(2020, 0, 6), hours, 60, new Set()), [])
})
