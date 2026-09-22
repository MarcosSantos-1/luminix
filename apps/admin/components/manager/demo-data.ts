import {
  CalendarDays,
  ChartNoAxesCombined,
  CircleHelp,
  House,
  Megaphone,
  Package,
  Settings2,
  ShoppingBag,
  Users,
  Wallet,
} from 'lucide-react'

export const managerNavigation = [
  { label: 'Início', icon: House },
  { label: 'Agenda', icon: CalendarDays },
  { label: 'Clientes', icon: Users },
  { label: 'Serviços', icon: ShoppingBag },
  { label: 'Financeiro', icon: Wallet },
  { label: 'Estoque', icon: Package },
  { label: 'Marketing', icon: Megaphone },
  { label: 'Relatórios', icon: ChartNoAxesCombined },
  { label: 'Configurações', icon: Settings2 },
]
export const supportNavigation = [{ label: 'Central de ajuda', icon: CircleHelp }]

// Fixtures exclusivas da prévia pública. Não usar como fallback de dados reais.
export const demoAppointments = [
  {
    time: '09:00',
    name: 'Juliana Lima',
    service: 'Depilação a laser · Axilas',
    initials: 'JL',
    status: 'Confirmado',
  },
  {
    time: '10:30',
    name: 'Camila Santos',
    service: 'Limpeza de pele profunda',
    initials: 'CS',
    status: 'Confirmado',
  },
  {
    time: '13:00',
    name: 'Beatriz Alves',
    service: 'Design de sobrancelhas',
    initials: 'BA',
    status: 'Confirmado',
  },
  {
    time: '14:30',
    name: 'Mariana Costa',
    service: 'Massagem relaxante',
    initials: 'MC',
    status: 'Pendente',
  },
  {
    time: '16:00',
    name: 'Fernanda Souza',
    service: 'Manicure + Pedicure',
    initials: 'FS',
    status: 'Confirmado',
  },
  {
    time: '17:30',
    name: 'Larissa Oliveira',
    service: 'Depilação a laser · Pernas',
    initials: 'LO',
    status: 'Confirmado',
  },
]
