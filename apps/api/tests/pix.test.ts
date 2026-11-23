import { describe, expect, it } from 'vitest'

import { crc16, normalizePixKey, pixCopyPaste, validPixKey } from '../src/shared/pix.js'

describe('Pix copia e cola', () => {
  it('uses the CRC16-CCITT of the BR Code', () => {
    // Reference value of CRC-16/CCITT-FALSE for "123456789".
    expect(crc16('123456789')).toBe('29B1')
  })

  it('builds a static code with amount, holder, city and a valid checksum', () => {
    const code = pixCopyPaste({
      keyType: 'email',
      key: 'Contato@Luniere.com',
      holder: 'Studio Lunière',
      city: 'São Paulo',
      amountCents: 4500,
      reference: 'LX-ab12',
    })
    expect(code.startsWith('000201')).toBe(true)
    expect(code).toContain('0014br.gov.bcb.pix0119contato@luniere.com')
    expect(code).toContain('540545.00')
    expect(code).toContain('5914STUDIO LUNIERE')
    expect(code).toContain('6009SAO PAULO')
    expect(code).toContain('0506LXab12')
    expect(code.slice(-4)).toBe(crc16(code.slice(0, -4)))
  })

  it('normalizes and validates keys', () => {
    expect(normalizePixKey('phone', '(11) 98765-4321')).toBe('+5511987654321')
    expect(normalizePixKey('cpf', '123.456.789-09')).toBe('12345678909')
    expect(validPixKey('phone', '(11) 98765-4321')).toBe(true)
    expect(validPixKey('cnpj', '12.345.678/0001-9')).toBe(false)
    expect(validPixKey('random', '123e4567-e89b-12d3-a456-426614174000')).toBe(true)
    expect(validPixKey('email', 'sem-arroba')).toBe(false)
  })
})
