export type TaxIdKind = 'cpf' | 'cnpj'

function checkDigit(digits: number[], weights: number[]) {
  const remainder = digits.reduce((sum, digit, index) => sum + digit * weights[index], 0) % 11
  return remainder < 2 ? 0 : 11 - remainder
}

export function isValidBrazilianTaxId(kind: TaxIdKind, value: string): boolean {
  const normalized = value.replace(/\D/g, '')
  const expectedLength = kind === 'cpf' ? 11 : 14
  if (normalized.length !== expectedLength || /^(\d)\1+$/.test(normalized)) return false
  const digits = [...normalized].map(Number)
  if (kind === 'cpf') {
    const first = checkDigit(digits.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2])
    const second = checkDigit([...digits.slice(0, 9), first], [11, 10, 9, 8, 7, 6, 5, 4, 3, 2])
    return digits[9] === first && digits[10] === second
  }
  const first = checkDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const second = checkDigit(
    [...digits.slice(0, 12), first],
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  )
  return digits[12] === first && digits[13] === second
}
