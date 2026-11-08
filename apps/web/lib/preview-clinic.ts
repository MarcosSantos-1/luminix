import { clinicCategories, type ClinicCategory } from './clinic-categories.ts'
import { clinicTheme, type PublicClinic, type PublicService } from './public-clinic.ts'

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
type DemoService = [
  name: string,
  description: string,
  priceCents: number,
  durationMinutes: number,
  priceType?: PublicService['priceType'],
]

const examples = {
  tatuagem: {
    name: 'Traço & Sombra Tattoo',
    theme: 'grafite',
    subtitle:
      'Do primeiro traço à última sombra. Tatuagens autorais feitas para contar a sua história.',
    category: 'Tatuagem',
    services: [
      ['Fine line', 'Traços delicados para desenhos pequenos e detalhados.', 22000, 60, 'from'],
      ['Blackwork', 'Composições em preto com contraste e desenho autoral.', 38000, 120, 'from'],
      [
        'Realismo em preto e cinza',
        'Projeto personalizado com atenção a volume, luz e textura.',
        65000,
        180,
        'from',
      ],
      ['Flash tattoo', 'Escolha um desenho da coleção do estúdio.', 18000, 45],
      [
        'Projeto autoral',
        'Conversa sobre referências, tamanho e composição da tatuagem.',
        0,
        30,
        'quote',
      ],
    ],
  },
  barbearia: {
    name: 'Oficina da Barba',
    theme: 'grafite',
    subtitle: 'Cortes, barba e acabamento no seu estilo.',
    category: 'Barbearia',
    services: [
      ['Corte degradê', 'Degradê com acabamento e finalização.', 6500, 45],
      ['Barba completa', 'Desenho e acabamento da barba.', 4500, 35],
    ],
  },
  unhas: {
    name: 'Ateliê das Unhas',
    theme: 'rosa',
    subtitle: 'Do esmalte clássico ao desenho que é só seu.',
    category: 'Unhas',
    services: [
      ['Esmaltação em gel', 'Preparação, esmaltação e acabamento.', 9000, 60],
      ['Nail art', 'Decoração personalizada conforme o desenho escolhido.', 3500, 30, 'from'],
    ],
  },
  depilacao: {
    name: 'Studio Pele Lisa',
    theme: 'violeta',
    subtitle: 'Um cuidado de cada vez, com atenção ao seu conforto.',
    category: 'Depilação',
    services: [
      ['Depilação de pernas', 'Atendimento para pernas, com duração conforme a área.', 9000, 45],
      ['Depilação de axilas', 'Atendimento individual para a região das axilas.', 3500, 20],
    ],
  },
  massoterapia: {
    name: 'Essência Massoterapia',
    theme: 'esmeralda',
    subtitle: 'Uma pausa para o corpo e para a rotina.',
    category: 'Massagem e Massoterapia',
    services: [
      ['Massagem relaxante', 'Sessão de massagem com foco em relaxamento.', 16000, 60],
      ['Massagem com pedras quentes', 'Sessão de relaxamento com pedras aquecidas.', 20000, 75],
    ],
  },
  quiropraxia: {
    name: 'Eixo Quiropraxia',
    theme: 'esmeralda',
    subtitle: 'Um espaço para conhecer o atendimento e conversar com a equipe.',
    category: 'Quiropraxia',
    services: [
      [
        'Avaliação inicial',
        'Conversa sobre seu histórico e objetivos para orientar o atendimento.',
        15000,
        45,
      ],
    ],
  },
  'estetica-avancada': {
    name: 'Ateliê de Estética Avançada',
    theme: 'dourado',
    subtitle: 'Atendimento personalizado desde a primeira conversa.',
    category: 'Biomedicina',
    services: [
      [
        'Avaliação estética',
        'Conversa sobre seus objetivos e as opções disponíveis no espaço.',
        12000,
        40,
      ],
    ],
  },
  'estetica-facial': {
    name: 'Lumina Estética Facial',
    theme: 'rosa',
    subtitle: 'Cuidado facial pensado para a sua rotina.',
    category: 'Estética facial',
    services: [
      ['Limpeza de pele', 'Higienização e cuidado facial de acordo com a avaliação.', 15000, 60],
      ['Hidratação facial', 'Sessão de hidratação e finalização facial.', 12000, 45],
    ],
  },
  'estetica-corporal': {
    name: 'Forma Estética Corporal',
    theme: 'azul',
    subtitle: 'Conheça os cuidados corporais e escolha seu próximo atendimento.',
    category: 'Estética corporal',
    services: [
      [
        'Avaliação corporal',
        'Conversa para conhecer os cuidados e o plano de atendimento.',
        10000,
        40,
      ],
    ],
  },
} satisfies Partial<
  Record<
    ClinicCategory,
    { name: string; theme: string; subtitle: string; category: string; services: DemoService[] }
  >
>

const demoVariants = Object.entries(examples).map(([key, entry]): PublicClinic => ({
  ...demoClinic,
  slug: `demonstracao-${key}`,
  name: entry.name,
  subtitle: entry.subtitle,
  theme: entry.theme,
  style: null,
  gallery: key === 'tatuagem' ? ['/clinic/heroes/tatuagem.webp'] : [],
  featured: [],
  services: (entry.services as DemoService[]).map(
    ([name, description, priceCents, durationMinutes, priceType = 'fixed'], index) => ({
      id: `demo-${key}-${index + 1}`,
      category: entry.category,
      name,
      description,
      priceCents,
      durationMinutes,
      priceType,
      bookingMode: 'request',
    }),
  ),
}))

const demos = [demoClinic, ...demoVariants]
export const demoOptions = [
  { slug: demoClinic.slug, label: clinicCategories.cabelo.label },
  ...Object.keys(examples).map((key) => ({
    slug: `demonstracao-${key}`,
    label: clinicCategories[key as keyof typeof examples].label,
  })),
]

export function getPreviewClinic(slug: string) {
  return demos.find((demo) => demo.slug === slug) ?? null
}

export function previewThemeOverride(slug: string, theme: string | string[] | undefined) {
  return getPreviewClinic(slug) && typeof theme === 'string' && clinicTheme(theme) === theme
    ? theme
    : null
}
