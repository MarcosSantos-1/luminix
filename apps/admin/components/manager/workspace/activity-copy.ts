import {
  BadgePercent,
  CalendarDays,
  Images,
  KeyRound,
  Package,
  Scissors,
  UserPlus,
  UsersRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

/** How each kind of activity reads in the panel (Início, sino e Central de atividades). */
export const activityKinds: Record<
  string,
  { icon: LucideIcon; label: string; insert: string; update?: string; section: string }
> = {
  appointments: {
    icon: CalendarDays,
    label: 'Agenda',
    insert: 'Novo agendamento',
    update: 'Agendamento atualizado',
    section: 'agenda',
  },
  clinic_clients: {
    icon: UserPlus,
    label: 'Clientes',
    insert: 'Nova cliente cadastrada',
    section: 'clientes',
  },
  services: {
    icon: Scissors,
    label: 'Serviços',
    insert: 'Serviço criado',
    update: 'Serviço pausado ou reativado',
    section: 'servicos',
  },
  promotions: {
    icon: BadgePercent,
    label: 'Promoções',
    insert: 'Promoção criada',
    section: 'servicos',
  },
  finance_entries: {
    icon: Wallet,
    label: 'Financeiro',
    insert: 'Lançamento no financeiro',
    section: 'financeiro',
  },
  inventory_movements: {
    icon: Package,
    label: 'Estoque',
    insert: 'Movimento no estoque',
    section: 'estoque',
  },
  media_items: {
    icon: Images,
    label: 'Mídia',
    insert: 'Foto guardada no acervo',
    section: 'midia',
  },
  professionals: {
    icon: UsersRound,
    label: 'Equipe',
    insert: 'Profissional na equipe',
    section: 'configuracoes',
  },
  clinic_memberships: {
    icon: KeyRound,
    label: 'Acessos',
    insert: 'Novo acesso ao painel',
    update: 'Acesso alterado',
    section: 'configuracoes',
  },
}

export type ActivityItem = {
  id: string
  entity: string
  action: string
  label: string | null
  detail: string | null
  actor: string | null
  state: 'unread' | 'read' | 'archived'
  createdAt: string
}

export function activityTitle(item: Pick<ActivityItem, 'entity' | 'action'>) {
  const kind = activityKinds[item.entity] ?? activityKinds.appointments
  return item.action === 'UPDATE' ? (kind.update ?? kind.insert) : kind.insert
}

export function activityDetail(item: Pick<ActivityItem, 'entity' | 'label' | 'detail'>) {
  const detail =
    item.entity === 'finance_entries' && item.detail ? `R$ ${item.detail}` : item.detail
  return [item.label, detail].filter(Boolean).join(' · ')
}

export function timeAgo(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (minutes < 1) return 'Agora'
  if (minutes < 60) return `Há ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `Há ${hours} h`
  const days = Math.round(hours / 24)
  if (days === 1) return 'Ontem'
  if (days < 7) return `Há ${days} dias`
  return new Date(iso).toLocaleDateString('pt-BR')
}
