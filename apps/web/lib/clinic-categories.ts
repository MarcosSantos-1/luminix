import type { PublicService } from './public-clinic.ts'

export const clinicCategories = {
  cabelo: { label: 'Cabeleireiro feminino', hero: '/clinic/demo-portrait.webp' },
  tatuagem: { label: 'Tatuagem', hero: '/clinic/heroes/tatuagem.webp' },
  barbearia: { label: 'Barbearia', hero: '/clinic/heroes/barbearia.webp' },
  unhas: { label: 'Nail design', hero: '/clinic/heroes/unhas.webp' },
  depilacao: { label: 'Depilação', hero: '/clinic/heroes/depilacao.webp' },
  massoterapia: { label: 'Massoterapia', hero: '/clinic/heroes/massoterapia.webp' },
  quiropraxia: { label: 'Quiropraxia', hero: '/clinic/heroes/massoterapia.webp' },
  'estetica-avancada': {
    label: 'Estética avançada',
    hero: '/clinic/heroes/estetica-avancada.webp',
  },
  'estetica-facial': { label: 'Estética facial', hero: '/clinic/heroes/estetica-facial.webp' },
  'estetica-corporal': {
    label: 'Estética corporal',
    hero: '/clinic/heroes/estetica-corporal.webp',
  },
  sobrancelhas: { label: 'Sobrancelhas', hero: null },
  cilios: { label: 'Cílios', hero: null },
  piercing: { label: 'Piercing', hero: null },
} as const

export type ClinicCategory = keyof typeof clinicCategories

function normalize(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

export function categoryForService({
  category,
  name,
}: Pick<PublicService, 'category' | 'name'>): ClinicCategory | null {
  const label = normalize(category)
  if (/tatuag|tattoo/.test(label)) return 'tatuagem'
  if (/piercing/.test(label)) return 'piercing'
  if (/sobrancelha/.test(label)) return 'sobrancelhas'
  if (/cilio/.test(label)) return 'cilios'
  if (/barbear|barbeiro/.test(label)) return 'barbearia'
  if (/cabel|capilar/.test(label))
    return /\b(masculin\w*|barba|barbear\w*|fade|navalh\w*)\b/.test(normalize(name))
      ? 'barbearia'
      : 'cabelo'
  if (/unha|nail|manicure|pedicure/.test(label)) return 'unhas'
  if (/depil/.test(label)) return 'depilacao'
  if (/quiropr/.test(label)) return 'quiropraxia'
  if (/massag|massoterap/.test(label)) return 'massoterapia'
  if (/avancad|biomedic|harmoniza/.test(label)) return 'estetica-avancada'
  if (/facial/.test(label)) return 'estetica-facial'
  if (/corporal/.test(label)) return 'estetica-corporal'
  return null
}

export function dominantClinicCategory(services: PublicService[]): ClinicCategory | null {
  const counts = new Map<ClinicCategory, number>()
  for (const service of services) {
    const category = categoryForService(service)
    if (category) counts.set(category, (counts.get(category) ?? 0) + 1)
  }
  return (
    [...counts].sort(([a, countA], [b, countB]) => countB - countA || a.localeCompare(b))[0]?.[0] ??
    null
  )
}

export function serviceCategoryArt(service: PublicService) {
  const category = categoryForService(service)
  if (!category) return null
  return `/clinic/categories/${category === 'barbearia' ? 'cabelo' : category}.webp`
}
