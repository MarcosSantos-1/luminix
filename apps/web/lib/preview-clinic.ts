import type { PublicClinic } from './public-clinic.ts'

// Explicit public fixture. Never used as a fallback for an API error or an unknown clinic.
const demoClinic: PublicClinic = {
  slug: 'demonstracao',
  name: 'Clínica de demonstração',
  theme: 'rosa',
  style: 'hair-salon',
  subtitle: 'Cor, corte e cuidado para o seu estilo.',
  gallery: ['/clinic/demo-portrait.webp', '/clinic/demo-studio.webp'],
  featured: [
    { serviceId: 'demo-5', photoUrl: '/clinic/demo-hair.webp' },
    { serviceId: 'demo-6', photoUrl: '/clinic/demo-portrait.webp' },
  ],
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
    {
      id: 'demo-5',
      name: 'Corte feminino',
      category: 'Cabelos',
      description: 'Corte e finalização pensados para sua rotina.',
      priceCents: 9500,
      priceType: 'from',
      durationMinutes: 60,
      bookingMode: 'request',
    },
    {
      id: 'demo-6',
      name: 'Iluminação e mechas',
      category: 'Cabelos',
      description: 'Cor e movimento com avaliação personalizada.',
      priceCents: 29000,
      priceType: 'from',
      durationMinutes: 150,
      bookingMode: 'request',
    },
  ],
}
export function getPreviewClinic(slug: string) {
  return slug === 'demonstracao' ? demoClinic : null
}
