import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { test } from 'node:test'
import {
  equipmentPresentation,
  suggestedEquipment,
} from '../components/onboarding/special-equipment.ts'

const catalog = JSON.parse(readFileSync(new URL('../lib/service-catalog.json', import.meta.url)))

test('assessments lead facial and body categories with an explicitly free price', () => {
  for (const [category, name] of [
    ['Estética facial', 'Avaliação facial'],
    ['Estética corporal', 'Avaliação corporal'],
  ]) {
    const first = catalog.find((item) => item.categoria === category)
    assert.equal(first.nome, name)
    assert.equal(first.preco_sugerido_brl, 0)
    assert.equal(first.tipo_preco, 'fixed')
  }
  assert.equal(
    catalog.find((item) => item.nome === 'Limpeza de pele nas costas').categoria,
    'Estética corporal',
  )
})

test('hair removal has contiguous thread, wax and laser groups', () => {
  const items = catalog.filter((item) => item.categoria === 'Depilação')
  const groups = items
    .filter((item, i) => i === 0 || item.grupo !== items[i - 1].grupo)
    .map((item) => item.grupo)
  assert.deepEqual(groups, ['linha', 'cera', 'laser'])
  assert.ok(
    items
      .filter((item) => item.grupo === 'linha')
      .every((item) => item.nome.startsWith('Depilação com linha:')),
  )
  assert.ok(
    items
      .filter((item) => item.grupo === 'cera')
      .every((item) => item.nome.startsWith('Depilação com cera:')),
  )
  assert.ok(
    items
      .filter((item) => item.grupo === 'laser')
      .every((item) => item.nome.startsWith('Depilação a laser:')),
  )
})

test('catalog has unique names, usable suggestions and valid equipment illustrations', () => {
  assert.equal(new Set(catalog.map((item) => item.nome)).size, catalog.length)
  for (const item of catalog) {
    assert.ok(Number.isInteger(item.duracao_minutos) && item.duracao_minutos > 0)
    assert.ok(Number.isFinite(item.preco_sugerido_brl) && item.preco_sugerido_brl >= 0)
  }
  const choices = suggestedEquipment(
    catalog.map((item, index) => ({ id: String(index), name: item.nome })),
  )
  assert.equal(choices.length, 21)
  for (const choice of [...choices, { name: 'Meu equipamento' }]) {
    const { image } = equipmentPresentation(choice.name)
    assert.ok(existsSync(new URL(`../public${image}`, import.meta.url)), image)
  }
  assert.equal(equipmentPresentation('Meu equipamento').image, '/brand/machines/21.webp')
})
