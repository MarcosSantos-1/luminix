import assert from 'node:assert/strict'
import test from 'node:test'
import { easter, holidaysBetween, holidaysForYear, normalizeCity } from '../lib/holidays.ts'

test('Easter and its movable holidays follow the Gregorian computus', () => {
  assert.equal(easter(2026), '2026-04-05')
  assert.equal(easter(2027), '2027-03-28')
  const year = holidaysForYear(2026)
  const named = (name) => year.find((item) => item.name === name)?.date
  assert.equal(named('Sexta-feira Santa'), '2026-04-03')
  assert.equal(named('Carnaval'), '2026-02-17')
  assert.equal(named('Corpus Christi'), '2026-06-04')
})

test('state and capital holidays depend on where the space is', () => {
  const sp = holidaysForYear(2026, { state: 'sp', city: 'São  Paulo' })
  assert.ok(sp.some((item) => item.date === '2026-07-09' && item.scope === 'state'))
  assert.ok(sp.some((item) => item.date === '2026-01-25' && item.scope === 'municipal'))
  assert.equal(sp.find((item) => item.name === 'Corpus Christi')?.scope, 'municipal')
  const elsewhere = holidaysForYear(2026, { state: 'RJ', city: 'Niterói' })
  assert.ok(!elsewhere.some((item) => item.date === '2026-01-25'))
  assert.equal(elsewhere.find((item) => item.name === 'Corpus Christi')?.scope, 'optional')
  assert.equal(normalizeCity(' Florianópolis '), 'florianopolis')
})

test('December asks about Christmas Eve through New Year across the year boundary', () => {
  const dates = holidaysBetween('2026-12-01', '2027-01-05').map((item) => item.date)
  assert.deepEqual(dates, ['2026-12-24', '2026-12-25', '2026-12-31', '2027-01-01'])
})

test('a date keeps a single entry with the strongest scope', () => {
  const ba = holidaysForYear(2026, { state: 'AL', city: 'Maceió' })
  const dates = ba.map((item) => item.date)
  assert.equal(new Set(dates).size, dates.length)
})
