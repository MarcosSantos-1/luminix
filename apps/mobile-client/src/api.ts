// Public space data comes from the Luminix site (same projection as the clinic page).
// Nothing private is requested yet: the client identity API does not exist (ADR-027).
const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? 'https://luminix.beauty').replace(/\/$/, '')

export type SpaceSummary = {
  slug: string
  code: string | null
  name: string
  theme: string
  logoUrl: string | null
  city: string | null
  address: string | null
  category: string | null
  mapQuery: string | null
  demo: boolean
}

export type Service = {
  id: string
  name: string
  category: string
  description: string | null
  priceCents: number
  priceType: 'fixed' | 'from' | 'quote'
  durationMinutes: number
  promoPercent?: number | null
  promoPriceCents?: number | null
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const response = await fetch(`${WEB_URL}${path}`, { signal })
    return response.ok ? ((await response.json()) as T) : null
  } catch {
    return null
  }
}

export async function searchSpaces(query: string, signal?: AbortSignal) {
  const data = await get<{ spaces: SpaceSummary[] }>(
    `/api/espacos?q=${encodeURIComponent(query)}`,
    signal,
  )
  return data?.spaces ?? null
}

export async function loadSpace(slug: string) {
  return get<{ summary: SpaceSummary; clinic: { services: Service[] } }>(
    `/api/espacos/${encodeURIComponent(slug)}`,
  )
}

/** Space codes look like KW-4374: two letters, a hyphen, four digits. */
export function maskSpaceCode(input: string) {
  const clean = input.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const letters = clean.slice(0, 2).replace(/[^A-Z]/g, '')
  const digits = letters.length === 2 ? clean.slice(2).replace(/\D/g, '').slice(0, 4) : ''
  return digits ? `${letters}-${digits}` : letters
}

export const isCompleteSpaceCode = (value: string) => /^[A-Z]{2}-\d{4}$/.test(value)

export function formatMoney(cents: number) {
  return `R$ ${(cents / 100)
    .toFixed(2)
    .replace('.', ',')
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
}

export function priceLabel(service: Service) {
  if (service.priceType === 'quote') return 'Sob consulta'
  const value = formatMoney(service.promoPriceCents ?? service.priceCents)
  return service.priceType === 'from' ? `A partir de ${value}` : value
}

export function durationLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`
  const rest = minutes % 60
  return rest ? `${Math.floor(minutes / 60)}h${String(rest).padStart(2, '0')}` : `${minutes / 60}h`
}
