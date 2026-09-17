export function toE164Phone(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length >= 12 && digits.length <= 13) return `+${digits}`
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`
  const plus = `+${digits}`
  return /^\+[1-9][0-9]{7,14}$/.test(plus) ? plus : ''
}

export function formatBrPhone(value: string): string {
  const digits = value.replace(/\D/g, '').replace(/^55/, '').slice(0, 11)
  if (!digits) return ''
  if (digits.length < 3) return `(${digits}`
  if (digits.length < 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length < 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

export function isCompletePhone(value: string): boolean {
  return /^\+[1-9][0-9]{7,14}$/.test(value)
}
