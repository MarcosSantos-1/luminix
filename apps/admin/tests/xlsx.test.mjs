import assert from 'node:assert/strict'
import test from 'node:test'
import { workbook } from '../lib/xlsx.ts'

const text = (bytes) => new TextDecoder().decode(bytes)

test('builds a stored zip with the workbook parts and escaped cells', async () => {
  const blob = workbook([
    {
      name: 'Serviços',
      rows: [
        ['Serviço', 'Preço'],
        ['Corte & escova <top>', { money: 12050 }],
      ],
    },
    { name: 'Pacotes/3x', rows: [['Pacote'], ['Laser']] },
  ])
  const bytes = new Uint8Array(await blob.arrayBuffer())
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04])
  const body = text(bytes)
  for (const part of [
    '[Content_Types].xml',
    'xl/workbook.xml',
    'xl/styles.xml',
    'xl/worksheets/sheet1.xml',
    'xl/worksheets/sheet2.xml',
  ])
    assert.ok(body.includes(part), part)
  assert.ok(body.includes('Corte &amp; escova &lt;top&gt;'))
  assert.ok(body.includes('<v>120.50</v>'))
  assert.ok(body.includes('name="Pacotes 3x"'))
  // End of central directory: 2 sheets + 5 fixed parts.
  const end = bytes.length - 22
  assert.deepEqual([...bytes.slice(end, end + 4)], [0x50, 0x4b, 0x05, 0x06])
  assert.equal(bytes[end + 10], 7)
})
