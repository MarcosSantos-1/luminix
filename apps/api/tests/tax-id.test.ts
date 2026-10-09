import { describe, expect, it } from 'vitest'
import { isValidBrazilianTaxId } from '../src/modules/clinics/tax-id.js'

describe('Brazilian tax ids', () => {
  it('validates CPF check digits', () => {
    expect(isValidBrazilianTaxId('cpf', '529.982.247-25')).toBe(true)
    expect(isValidBrazilianTaxId('cpf', '529.982.247-24')).toBe(false)
    expect(isValidBrazilianTaxId('cpf', '111.111.111-11')).toBe(false)
  })

  it('validates CNPJ check digits', () => {
    expect(isValidBrazilianTaxId('cnpj', '04.252.011/0001-10')).toBe(true)
    expect(isValidBrazilianTaxId('cnpj', '04.252.011/0001-11')).toBe(false)
    expect(isValidBrazilianTaxId('cnpj', '00.000.000/0000-00')).toBe(false)
  })
})
