/**
 * Static Pix "copia e cola" (BR Code, EMV QR of the Banco Central) with a fixed amount.
 * Generated from the space's own key: no bank, PSP or Stripe involved. The client pastes it in
 * her bank app; the space checks the statement and confirms (ADR-037).
 */
export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'random'

const field = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`

/** Upper case ASCII without accents, as banks print it; cut to the EMV limit. */
function plain(value: string, max: number) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 .-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, max)
}

/** The key as the Pix directory stores it: digits for CPF/CNPJ, +55 for phones. */
export function normalizePixKey(type: PixKeyType, key: string) {
  const value = key.trim()
  if (type === 'cpf' || type === 'cnpj') return value.replace(/\D/g, '')
  if (type === 'phone') {
    const digits = value.replace(/\D/g, '')
    return digits.startsWith('55') && digits.length >= 12 ? `+${digits}` : `+55${digits}`
  }
  if (type === 'email') return value.toLowerCase()
  return value.toLowerCase()
}

export function validPixKey(type: PixKeyType, key: string) {
  const value = normalizePixKey(type, key)
  if (type === 'cpf') return /^\d{11}$/.test(value)
  if (type === 'cnpj') return /^\d{14}$/.test(value)
  if (type === 'phone') return /^\+55\d{10,11}$/.test(value)
  if (type === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 77
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
}

/** CRC16-CCITT (poly 0x1021, init 0xFFFF), as required by the BR Code. */
export function crc16(payload: string) {
  let crc = 0xffff
  for (let index = 0; index < payload.length; index += 1) {
    crc ^= payload.charCodeAt(index) << 8
    for (let bit = 0; bit < 8; bit += 1)
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

export function pixCopyPaste(input: {
  keyType: PixKeyType
  key: string
  holder: string
  city: string
  amountCents: number
  /** Shown in the statement when the bank supports it (letters and digits, up to 25). */
  reference?: string
}) {
  const account =
    field('00', 'br.gov.bcb.pix') + field('01', normalizePixKey(input.keyType, input.key))
  const reference = (input.reference ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***'
  const payload =
    field('00', '01') +
    field('26', account) +
    field('52', '0000') +
    field('53', '986') +
    field('54', (input.amountCents / 100).toFixed(2)) +
    field('58', 'BR') +
    field('59', plain(input.holder, 25) || 'RECEBEDOR') +
    field('60', plain(input.city, 15) || 'BRASIL') +
    field('62', field('05', reference)) +
    '6304'
  return payload + crc16(payload)
}
