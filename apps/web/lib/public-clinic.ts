export type PublicService = {
  id: string
  name: string
  category: string
  description: string | null
  priceCents: number
  priceType: 'fixed' | 'from' | 'quote'
  durationMinutes: number
  bookingMode: string
}
export type PublicClinic = {
  slug: string
  name: string
  theme: string
  style?: string | null
  subtitle?: string | null
  featured?: { serviceId: string; photoUrl: string | null }[]
  gallery?: string[]
  foundedYear: number | null
  logoUrl: string | null
  whatsapp: string | null
  instagram: string | null
  facebook: string | null
  website: string | null
  location: {
    line: string | null
    number: string | null
    district: string | null
    city: string | null
    state: string | null
    postalCode: string | null
  } | null
  hours: { weekday: number; available: boolean; periods: { start: string; end: string }[] }[]
  services: PublicService[]
}

// External links are never rendered verbatim from onboarding strings.
export function publicLink(
  value: string | null,
  kind: 'instagram' | 'facebook' | 'website',
): string | null {
  if (!value?.trim()) return null
  const text = value.trim()
  if (kind === 'instagram' && /^@?[a-zA-Z0-9._]{1,30}$/.test(text))
    return `https://www.instagram.com/${text.replace(/^@/, '')}/`
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      !url.hostname.includes('.')
    )
      return null
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    if (kind === 'instagram' && host !== 'instagram.com') return null
    if (kind === 'facebook' && !['facebook.com', 'm.facebook.com', 'fb.com'].includes(host))
      return null
    return url.href
  } catch {
    return null
  }
}
export function whatsappLink(phone: string | null): string | null {
  return phone && /^\+[1-9]\d{7,14}$/.test(phone) ? `https://wa.me/${phone.slice(1)}` : null
}

export function categoryIntroduction(category: string): string {
  const text = category
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  if (/facial|pele|rosto/.test(text))
    return 'Um momento de atenção para a sua pele, com cuidados escolhidos para você.'
  if (/corpo|corporal|massag|relax/.test(text))
    return 'Desacelere e descubra cuidados para o corpo e para o seu bem-estar.'
  if (/cabelo|capilar|corte|coloracao/.test(text))
    return 'Seu estilo, sua expressão. Encontre o cuidado que combina com seus cabelos.'
  if (/unha|manicure|pedicure/.test(text)) return 'Cuidado e personalidade nos pequenos detalhes.'
  if (/cilio|sobrancelha|olhar/.test(text))
    return 'Detalhes que valorizam a sua expressão e o seu jeito de ser.'
  if (/depil|laser/.test(text))
    return 'Conheça as opções e converse com a equipe sobre o cuidado adequado para você.'
  if (/maquiagem|make/.test(text))
    return 'Para celebrar seu estilo, do cotidiano aos momentos especiais.'
  return `Conheça os serviços de ${category.toLocaleLowerCase('pt-BR')} e encontre seu próximo cuidado.`
}

export function groupServices(services: PublicService[]) {
  const groups = new Map<string, PublicService[]>()
  for (const service of services) {
    const category = service.category.trim() || 'Cuidados'
    groups.set(category, [...(groups.get(category) ?? []), service])
  }
  return [...groups].map(([name, items], index) => ({
    name,
    items,
    anchor: `categoria-${index + 1}`,
    introduction: categoryIntroduction(name),
  }))
}

export function clinicTheme(theme: string) {
  return ['rosa', 'grafite', 'violeta', 'dourado', 'esmeralda', 'azul'].includes(theme)
    ? theme
    : 'rosa'
}

export function showcaseServices(clinic: PublicClinic) {
  const byId = new Map(clinic.services.map((service) => [service.id, service]))
  const result: PublicService[] = []
  const used = new Set<string>()
  const categories = new Set<string>()
  for (const { serviceId } of clinic.featured ?? []) {
    const service = byId.get(serviceId)
    if (!service || used.has(serviceId)) continue
    result.push(service)
    used.add(serviceId)
    categories.add(service.category)
    if (result.length === 4) return result
  }
  // Prefer one per category, then fill any remaining slots from the full catalog.
  for (const service of clinic.services) {
    if (categories.has(service.category)) continue
    result.push(service)
    categories.add(service.category)
    used.add(service.id)
    if (result.length === 4) return result
  }
  return [...result, ...clinic.services.filter(({ id }) => !used.has(id))].slice(0, 4)
}
