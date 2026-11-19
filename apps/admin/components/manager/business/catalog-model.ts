import { useEffect } from 'react'
import { dateBr, money } from './format'

export type PriceType = 'fixed' | 'from' | 'quote'
export type BookingMode = 'instant' | 'request' | 'manual_release'
export type Audience = 'all' | 'women' | 'men'
export type Service = {
  id: string
  name: string
  category: string
  description: string
  priceCents: number
  priceType: PriceType
  durationMinutes: number
  bookingMode: BookingMode
  audience: Audience
  sensitive: boolean
  status: 'active' | 'archived'
  professionals: number
  /** Who does it (active professionals). */
  professionalIds?: string[]
  bookings90d: number
  promotion: {
    id: string
    percent: number
    endsOn: string | null
    priceCents: number | null
  } | null
}
export type Promotion = {
  id: string
  name: string
  /** percent: one discount for every chosen service; custom: a price typed for each one. */
  kind: 'percent' | 'custom'
  percent: number
  /** Only for kind = custom: service id → promotional price in cents. */
  prices: Record<string, number>
  startsOn: string
  endsOn: string | null
  status: 'active' | 'paused' | 'archived'
  showOnSite: boolean
  serviceIds: string[]
}
export type TeamMember = { id: string; name: string; photoUrl: string | null }
export type Catalog = {
  today: string
  canManage: boolean
  /** The active professionals, for "Quem faz". */
  team?: TeamMember[]
  services: Service[]
  promotions: Promotion[]
}
export const bookingModes: { id: BookingMode; label: string; hint: string }[] = [
  { id: 'instant', label: 'Cliente marca direto', hint: 'O horário fica reservado na hora.' },
  {
    id: 'request',
    label: 'Cliente pede, você confirma',
    hint: 'Bom para serviços que pedem avaliação.',
  },
  {
    id: 'manual_release',
    label: 'Depende de aparelho ou sala',
    hint: 'Disponibilidade combinada com a equipe.',
  },
]
export const priceTypes: { id: PriceType; label: string }[] = [
  { id: 'fixed', label: 'Valor fixo' },
  { id: 'from', label: 'A partir de' },
  { id: 'quote', label: 'Sob consulta' },
]
/** Promotional price of a service inside a promotion (null when it is not a real discount). */
export function promoPrice(promotion: Promotion, service: Service) {
  if (promotion.kind === 'custom') return promotion.prices[service.id] ?? null
  return Math.round((service.priceCents * (100 - promotion.percent)) / 100)
}

/**
 * Price list of a promotion, ready to paste on WhatsApp: title, period and one block per
 * category ("subtítulo") with "de R$ X por R$ Y". WhatsApp formatting: *bold*, _italic_, ~strike~.
 */
export function promotionText(promotion: Promotion, services: Service[]) {
  const chosen = services.filter((service) => promotion.serviceIds.includes(service.id))
  const lines = [`✨ *${(promotion.name.trim() || 'Promoção').toLocaleUpperCase('pt-BR')}* ✨`]
  if (promotion.endsOn)
    lines.push(`🗓️ _De ${dateBr(promotion.startsOn)} até ${dateBr(promotion.endsOn)}_`)
  else if (promotion.kind === 'percent') lines.push(`💖 _${promotion.percent}% de desconto_`)
  for (const category of [...new Set(chosen.map((service) => service.category))]) {
    lines.push('', `*${category.toLocaleUpperCase('pt-BR')}*`)
    for (const service of chosen.filter((item) => item.category === category)) {
      const price = promoPrice(promotion, service)
      lines.push(
        price == null
          ? `▫️ ${service.name}: ${money(service.priceCents)}`
          : `▫️ ${service.name}: de ~${money(service.priceCents)}~ por *${money(price)}*`,
      )
    }
  }
  lines.push('', '📲 Chama aqui para agendar!')
  return lines.join('\n')
}

/** The whole price table for WhatsApp, one title per category, with today's promotions. */
export function priceListText(
  services: Service[],
  packages: { name: string; sessions: number; priceCents: number }[] = [],
  clinicName = '',
) {
  const active = services.filter((service) => service.status === 'active')
  const lines = [
    `💖 *TABELA DE PREÇOS${clinicName ? ` · ${clinicName.toLocaleUpperCase('pt-BR')}` : ''}*`,
  ]
  for (const category of [...new Set(active.map((service) => service.category))].sort()) {
    lines.push('', `*${category.toLocaleUpperCase('pt-BR')}*`)
    for (const service of active.filter((item) => item.category === category)) {
      const promo = service.promotion?.priceCents
      lines.push(
        service.priceType !== 'quote' && promo != null
          ? `▫️ ${service.name}: ~${money(service.priceCents)}~ *${priceLabel(service, promo)}*`
          : `▫️ ${service.name}: ${priceLabel(service)}`,
      )
    }
  }
  if (packages.length) {
    lines.push('', '*PACOTES*')
    for (const item of packages)
      lines.push(`▫️ ${item.name}: ${item.sessions} sessões por *${money(item.priceCents)}*`)
  }
  lines.push('', '📲 Chama aqui para agendar!')
  return lines.join('\n')
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Editors replace the list on the same page: start them at the top, not where the list was. */
export function useScrollTop() {
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [])
}

export function promotionState(
  promotion: Pick<Promotion, 'status' | 'startsOn' | 'endsOn'>,
  today: string,
) {
  if (promotion.status === 'archived') return { label: 'Encerrada', tone: 'off' as const }
  if (promotion.status === 'paused') return { label: 'Pausada', tone: 'off' as const }
  if (promotion.endsOn && promotion.endsOn < today)
    return { label: 'Encerrada', tone: 'off' as const }
  if (promotion.startsOn > today) return { label: 'Agendada', tone: 'info' as const }
  return { label: 'Ativa', tone: 'on' as const }
}

export function priceLabel(
  service: Pick<Service, 'priceType' | 'priceCents'>,
  cents = service.priceCents,
) {
  if (service.priceType === 'quote') return 'Sob consulta'
  return `${service.priceType === 'from' ? 'A partir de ' : ''}${money(cents)}`
}
