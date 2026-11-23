import { formatBrPhone } from './phone'
import { isValidBrazilianTaxId } from './tax-id'

export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'random'

export const pixKeyLabels: Record<PixKeyType, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  email: 'E-mail',
  phone: 'Celular',
  random: 'Chave aleatória',
}

const uuidLike = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i

function maskCpf(digits: string) {
  return digits
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

function maskCnpj(digits: string) {
  return digits
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

/**
 * Guesses the key type from what was typed: "@" is an e-mail, 32 hex digits a random key,
 * 14 digits a CNPJ, 11 digits a CPF when its check digits match (otherwise a mobile number),
 * "+55" or 10 digits a phone. Returns null while it is still ambiguous.
 */
export function detectPixKeyType(value: string): PixKeyType | null {
  const text = value.trim()
  if (!text) return null
  if (text.includes('@')) return 'email'
  if (/[a-f]/i.test(text) && /^[0-9a-f-]+$/i.test(text)) return 'random'
  if (/[a-z]/i.test(text)) return 'email'
  const digits = text.replace(/\D/g, '')
  if (text.startsWith('+')) return 'phone'
  if (digits.length === 14) return 'cnpj'
  if (/[./]/.test(text) && digits.length <= 11) return 'cpf'
  if (/[()]/.test(text)) return 'phone'
  if (digits.length === 11) {
    if (isValidBrazilianTaxId('cpf', digits)) return 'cpf'
    if (/^[1-9]{2}9/.test(digits)) return 'phone'
    return 'cpf'
  }
  if (digits.length === 10) return 'phone'
  if (digits.length > 11) return 'cnpj'
  return null
}

/** The key with the mask of its type, as people read it. */
export function formatPixKey(type: PixKeyType | null, value: string) {
  if (!type) return value
  if (type === 'cpf') return maskCpf(value.replace(/\D/g, ''))
  if (type === 'cnpj') return maskCnpj(value.replace(/\D/g, ''))
  if (type === 'phone') return formatBrPhone(value)
  if (type === 'email') return value.trim().toLowerCase()
  return value.trim().toLowerCase().slice(0, 36)
}

/** What is wrong with the key for its type, in plain words; null when it is fine. */
export function pixKeyProblem(type: PixKeyType | null, value: string): string | null {
  const text = value.trim()
  if (!text) return null
  if (!type) return 'Escolha o tipo da chave.'
  const digits = text.replace(/\D/g, '')
  if (type === 'cpf')
    return isValidBrazilianTaxId('cpf', digits) ? null : 'Esse CPF não parece válido.'
  if (type === 'cnpj')
    return isValidBrazilianTaxId('cnpj', digits) ? null : 'Esse CNPJ não parece válido.'
  if (type === 'phone')
    return /^(?:55)?[1-9]{2}9?\d{8}$/.test(digits) ? null : 'Informe o celular com DDD.'
  if (type === 'email')
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? null : 'Esse e-mail não parece válido.'
  return uuidLike.test(text) ? null : 'A chave aleatória tem 32 letras e números.'
}
