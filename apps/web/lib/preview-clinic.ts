import type { PublicClinic } from './public-clinic.ts'

// Explicit public fixture. Never used as a fallback for an API error or an unknown clinic.
const demoClinic: PublicClinic = {
  slug: 'demonstracao',
  name: 'Clínica de demonstração',
  theme: 'rosa',
  foundedYear: null,
  logoUrl: null,
  whatsapp: null,
  instagram: null,
  facebook: null,
  website: null,
  location: null,
  hours: [],
  services: [
    {
      id: 'demo-1',
      name: 'Limpeza de pele',
      category: 'Estética facial',
      description:
        'Um cuidado dedicado à sua pele. Converse com a equipe para conhecer as etapas do atendimento.',
      priceCents: 15000,
      priceType: 'from',
      durationMinutes: 60,
      bookingMode: 'request',
    },
    {
      id: 'demo-2',
      name: 'Hidratação facial',
      category: 'Estética facial',
      description: 'Uma pausa para renovar sua rotina de cuidados.',
      priceCents: 12000,
      priceType: 'fixed',
      durationMinutes: 45,
      bookingMode: 'instant',
    },
    {
      id: 'demo-3',
      name: 'Massagem relaxante',
      category: 'Bem-estar corporal',
      description: 'Tempo reservado para desacelerar e cuidar de você.',
      priceCents: 18000,
      priceType: 'fixed',
      durationMinutes: 60,
      bookingMode: 'instant',
    },
    {
      id: 'demo-4',
      name: 'Design de sobrancelhas',
      category: 'Sobrancelhas e cílios',
      description: 'Detalhes pensados para valorizar a sua expressão.',
      priceCents: 0,
      priceType: 'quote',
      durationMinutes: 30,
      bookingMode: 'request',
    },
  ],
}
export function getPreviewClinic(slug: string) {
  return slug === 'demonstracao' ? demoClinic : null
}
