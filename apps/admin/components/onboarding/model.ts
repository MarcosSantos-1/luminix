import {
  Banknote,
  MapPin,
  Building2,
  CalendarDays,
  Check,
  CreditCard,
  Scissors,
  Sparkles,
  Users,
} from 'lucide-react'
import catalog from '@/lib/service-catalog.json'

export type Audience = 'all' | 'women' | 'men'
export type Service = {
  category: string
  name: string
  description: string
  priceCents: number
  durationMinutes: number
  priceType: 'fixed' | 'from' | 'quote'
  bookingMode: 'instant' | 'request' | 'manual_release'
  audience: Audience
  resourceName: string
  cancellationHours: number | null
}
export type ProfessionalGender = 'female' | 'male'
export type Professional = {
  name: string
  role: string
  gender: ProfessionalGender
  audience: Audience
  serviceNames: string[]
  photoPreview?: string
}

export const professionalAvatarSrc: Record<ProfessionalGender, string> = {
  female: '/brand/onboarding/avatarF.png',
  male: '/brand/onboarding/avatarM.png',
}
export type DaySchedule = {
  weekday: number
  enabled: boolean
  start: string
  end: string
  breaks: { start: string; end: string }[]
}
export type ProfessionalSchedule = { name: string; days: DaySchedule[] }
export type Payload = {
  name: string
  ownerName: string
  email: string
  phone: string
  clinic: {
    foundedYear: string
    whatsapp: string
    instagram: string
    facebook: string
    website: string
    taxId: string
    taxIdKind?: 'cpf' | 'cnpj'
    addressLine: string
    addressNumber: string
    addressNote: string
    city: string
    state: string
    postalCode: string
  }
  uiFocus?: 'address' | 'hours' | 'payments' | 'rules'
  occupations: string[]
  services: Service[]
  teamMode: 'solo' | 'team'
  professionals: Professional[]
  businessHours: DaySchedule[]
  professionalSchedules: ProfessionalSchedule[]
  preferences: {
    cancellationHours: number
    specialCancellationHours: number
    acceptInApp: boolean
    packagePaymentMode: 'clinic_only' | 'in_app' | 'both'
  }
}
export type Draft = {
  version: number
  formatVersion: number
  step: string
  status: string
  payload: Payload
}
export type CatalogItem = (typeof catalog)[number]

export const stepInfo = [
  {
    key: 'contact',
    label: 'Início',
    title: 'Vamos preparar seu espaço?',
    text: 'Uma visão do que vamos organizar. Nome, e-mail e celular já vieram da sua conta.',
    icon: Sparkles,
  },
  {
    key: 'clinic',
    label: 'Clínica',
    title: 'Como sua clínica se chama?',
    text: 'Esse é o nome que suas clientes veem na agenda e no convite. Redes, documento e o ano de abertura podem esperar.',
    icon: Building2,
  },
  {
    key: 'catalog',
    label: 'Serviços',
    title: 'O que a clínica oferece?',
    text: 'Escolha uma área e marque os atendimentos que entram na agenda. Os valores são sugestões — na próxima etapa você ajusta o que for diferente.',
    icon: Scissors,
  },
  {
    key: 'services',
    label: 'Detalhes',
    title: 'Confira valor e duração',
    text: 'Cada serviço já vem com uma sugestão. Ajuste só o que não combina com o seu atendimento. Nada é cobrado da cliente agora.',
    icon: Sparkles,
  },
  {
    key: 'structure',
    label: 'Equipe',
    title: 'Quem atende?',
    text: 'Se for só você, todos os serviços ficam no seu nome. Com equipe, cada profissional leva os atendimentos que ela realiza.',
    icon: Users,
  },
  {
    key: 'schedule',
    label: 'Endereço',
    title: 'Onde fica a clínica?',
    text: 'Comece pelo CEP. A busca automática entra em seguida; enquanto isso, você completa rua, número e cidade na mão.',
    icon: MapPin,
  },
  {
    key: 'hours',
    label: 'Horários',
    title: 'Quando a clínica abre?',
    text: 'Primeiro o horário do espaço. Depois, ajuste o atendimento de cada profissional — sempre dentro do que a clínica permite.',
    icon: CalendarDays,
  },
  {
    key: 'payments',
    label: 'Pagamentos',
    title: 'Como você prefere receber?',
    text: 'Escolha se cobrança fica fora do app ou se quer pagamentos no app. Nada é cobrado agora; o Stripe Connect vem depois.',
    icon: CreditCard,
  },
  {
    key: 'rules',
    label: 'Regras',
    title: 'Cancelamento e pacotes',
    text: 'Defina prazos de cancelamento e como pacotes de sessões podem ser pagos.',
    icon: Banknote,
  },
  {
    key: 'review',
    label: 'Finalizar',
    title: 'Sua clínica está pronta',
    text: 'Ao abrir, criamos a agenda, os serviços e o código para compartilhar. Tudo isso continua editável no painel.',
    icon: Check,
  },
] as const

export const dayNames: Record<number, string> = {
  0: 'Domingo',
  1: 'Segunda',
  2: 'Terça',
  3: 'Quarta',
  4: 'Quinta',
  5: 'Sexta',
  6: 'Sábado',
}

export const categories = [
  'Estética facial',
  'Estética corporal',
  'Depilação',
  'Massagem e Massoterapia',
  'Biomedicina',
  'Quiropraxia',
  'Cabelo',
  'Sobrancelhas',
  'Cílios',
  'Unhas',
  'Tatuagem',
  'Piercing',
] as const

const categoryArt: Record<string, string> = {
  'Estética facial': '/brand/services/facial-1.png',
  'Estética corporal': '/brand/services/corporal-2.png',
  Depilação: '/brand/services/depilacao-3.png',
  'Massagem e Massoterapia': '/brand/services/massagem-4.png',
  Biomedicina: '/brand/services/biomedicina-5.png',
  Quiropraxia: '/brand/services/quiroplaxia-6.png',
  Cabelo: '/brand/services/cabeleleira-7.png',
  Sobrancelhas: '/brand/services/sobrancelhas-8.png',
  Cílios: '/brand/services/cilios-9.png',
  Unhas: '/brand/services/unhas-10.png',
  Tatuagem: '/brand/services/tatuagem-11.png',
  Piercing: '/brand/services/piercing-12.png',
}

export function categoryArtSrc(name: string) {
  return categoryArt[name] ?? ''
}

export function servicesInCategory(name: string) {
  return catalog.filter((item) => item.categoria === name)
}

export function formatMoney(cents: number) {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`
}

export const durationChoices = [30, 45, 60, 90, 120, 150, 180, 240]

export function persistedStepKey(key: string) {
  if (key === 'preferences') return 'payments'
  return key
}

export function resumeStepIndex(stored: string, focus?: Payload['uiFocus']) {
  if (stored === 'preferences') {
    if (focus === 'rules') return stepInfo.findIndex((item) => item.key === 'rules')
    return stepInfo.findIndex((item) => item.key === 'payments')
  }
  if (stored === 'payments') return stepInfo.findIndex((item) => item.key === 'payments')
  if (stored === 'rules') return stepInfo.findIndex((item) => item.key === 'rules')
  if (stored === 'hours') return stepInfo.findIndex((item) => item.key === 'hours')
  if (stored === 'schedule' && focus === 'hours')
    return stepInfo.findIndex((item) => item.key === 'hours')
  if (stored === 'schedule') return stepInfo.findIndex((item) => item.key === 'schedule')
  const index = stepInfo.findIndex((item) => item.key === stored)
  return index >= 0 ? index : stepInfo.findIndex((item) => item.key === 'clinic')
}

export function uiFocusForStepKey(key: (typeof stepInfo)[number]['key']): Payload['uiFocus'] | undefined {
  if (key === 'schedule') return 'address'
  if (key === 'hours') return 'hours'
  if (key === 'payments') return 'payments'
  if (key === 'rules') return 'rules'
  return undefined
}
