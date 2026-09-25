import {
  Activity,
  MapPin,
  Building2,
  CalendarDays,
  Check,
  CreditCard,
  Eye,
  Flower2,
  Gem,
  Hand,
  Heart,
  PenLine,
  PersonStanding,
  Scissors,
  Sparkles,
  Stethoscope,
  UserRound,
  Users,
  type LucideIcon,
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
export type Professional = { name: string; role: string; audience: Audience; serviceNames: string[] }
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
  uiFocus?: 'address' | 'hours'
  occupations: string[]
  services: Service[]
  teamMode: 'solo' | 'team'
  professionals: Professional[]
  businessHours: { weekday: number; enabled: boolean; start: string; end: string }[]
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
    label: 'Você',
    title: 'Vamos começar',
    text: 'Seu nome, e-mail e celular identificam quem administra a clínica. Se você sair no meio, o celular serve para retomar este cadastro de onde parou.',
    icon: UserRound,
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
    label: 'Catálogo',
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
    text: 'Este horário vale para o espaço inteiro. A agenda de cada profissional pode ser refinada no painel.',
    icon: CalendarDays,
  },
  {
    key: 'preferences',
    label: 'Regras',
    title: 'Como você combina com a cliente?',
    text: 'Defina até quando ela pode cancelar e onde o pagamento acontece. Nenhuma cobrança é feita nesta etapa.',
    icon: CreditCard,
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

export const categories = [...new Set(catalog.map((item) => item.categoria))]

const categoryIcons: Record<string, LucideIcon> = {
  'Estética facial': Sparkles,
  'Estética corporal': PersonStanding,
  Depilação: Scissors,
  Cabelo: Flower2,
  Unhas: Heart,
  Sobrancelhas: Eye,
  Cílios: Eye,
  Tatuagem: PenLine,
  Piercing: Gem,
  Quiropraxia: Activity,
  Massoterapia: Hand,
  Biomedicina: Stethoscope,
}

export function categoryIcon(name: string) {
  return categoryIcons[name] ?? Sparkles
}

export function servicesInCategory(name: string) {
  return catalog.filter((item) => item.categoria === name)
}

export function formatMoney(cents: number) {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`
}

export const durationChoices = [30, 45, 60, 90, 120, 150, 180, 240]

export function persistedStepKey(key: string) {
  return key === 'hours' ? 'schedule' : key
}
