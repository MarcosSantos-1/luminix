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
  type LucideIcon,
} from 'lucide-react'

export type ManagerSectionId =
  | 'inicio'
  | 'agenda'
  | 'clientes'
  | 'servicos'
  | 'financeiro'
  | 'estoque'
  | 'marketing'
  | 'relatorios'
  | 'configuracoes'

export type ManagerNavItem = {
  id: ManagerSectionId
  label: string
  icon: LucideIcon
  subtitle: string
  searchPlaceholder: string
  searchHint: string
  createLabel: string
}

export const managerNavigation: ManagerNavItem[] = [
  {
    id: 'inicio',
    label: 'Início',
    icon: House,
    subtitle: 'Sua rotina de hoje',
    searchPlaceholder: 'Buscar clientes, serviços...',
    searchHint: 'Páginas do gestor e exemplos ilustrativos do início.',
    createLabel: 'Novo agendamento',
  },
  {
    id: 'agenda',
    label: 'Agenda',
    icon: CalendarDays,
    subtitle: 'Atendimentos do dia e da semana',
    searchPlaceholder: 'Buscar na agenda...',
    searchHint: 'Páginas do gestor e exemplos ilustrativos da agenda.',
    createLabel: 'Novo agendamento',
  },
  {
    id: 'clientes',
    label: 'Clientes',
    icon: Users,
    subtitle: 'Quem cuida com você',
    searchPlaceholder: 'Buscar clientes...',
    searchHint: 'Páginas do gestor e exemplos ilustrativos de clientes.',
    createLabel: 'Adicionar cliente',
  },
  {
    id: 'servicos',
    label: 'Serviços',
    icon: ShoppingBag,
    subtitle: 'Catálogo de cuidados',
    searchPlaceholder: 'Buscar serviços...',
    searchHint: 'Páginas do gestor e exemplos ilustrativos de serviços.',
    createLabel: 'Novo serviço',
  },
  {
    id: 'financeiro',
    label: 'Financeiro',
    icon: Wallet,
    subtitle: 'Entradas e pendências',
    searchPlaceholder: 'Buscar lançamentos...',
    searchHint: 'Páginas do gestor e exemplos ilustrativos do financeiro.',
    createLabel: 'Novo lançamento',
  },
  {
    id: 'estoque',
    label: 'Estoque',
    icon: Package,
    subtitle: 'Produtos e reposições',
    searchPlaceholder: 'Buscar produtos...',
    searchHint: 'Páginas do gestor e exemplos ilustrativos do estoque.',
    createLabel: 'Novo produto',
  },
  {
    id: 'marketing',
    label: 'Marketing',
    icon: Megaphone,
    subtitle: 'Campanhas e recados',
    searchPlaceholder: 'Buscar campanhas...',
    searchHint: 'Páginas do gestor e exemplos ilustrativos de marketing.',
    createLabel: 'Nova campanha',
  },
  {
    id: 'relatorios',
    label: 'Relatórios',
    icon: ChartNoAxesCombined,
    subtitle: 'Leitura do período',
    searchPlaceholder: 'Buscar relatórios...',
    searchHint: 'Páginas do gestor e exemplos ilustrativos de relatórios.',
    createLabel: 'Exportar relatório',
  },
  {
    id: 'configuracoes',
    label: 'Configurações',
    icon: Settings2,
    subtitle: 'Dados da clínica',
    searchPlaceholder: 'Buscar páginas...',
    searchHint: 'Páginas do gestor. Os dados da clínica não entram nesta busca.',
    createLabel: 'Editar clínica',
  },
]

export const supportNavigation = [{ label: 'Central de ajuda', icon: CircleHelp }]

// Fixtures exclusivas da prévia. Não usar como fallback de dados reais.
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

export type SketchId = Exclude<ManagerSectionId, 'inicio' | 'configuracoes'>

export type SketchRow = {
  id: string
  primary: string
  secondary: string
  meta: string
  status: string
}

export type SectionSketch = {
  columns: { id: string; label: string; rowHeader?: boolean }[]
  rows: SketchRow[]
  stats: { label: string; value: string; detail: string }[]
  emptyTitle: string
  emptyDetail: string
}

const situation = [
  { id: 'primary', label: 'Item', rowHeader: true },
  { id: 'secondary', label: 'Detalhe' },
  { id: 'meta', label: 'Referência' },
  { id: 'status', label: 'Situação' },
]

export const sectionSketches: Record<SketchId, SectionSketch> = {
  agenda: {
    columns: [
      { id: 'primary', label: 'Cliente', rowHeader: true },
      { id: 'secondary', label: 'Serviço' },
      { id: 'meta', label: 'Horário' },
      { id: 'status', label: 'Situação' },
    ],
    rows: demoAppointments.slice(0, 4).map((item) => ({
      id: item.time,
      primary: item.name,
      secondary: item.service,
      meta: item.time,
      status: item.status,
    })),
    stats: [
      { label: 'Hoje', value: '6', detail: 'exemplo' },
      { label: 'Confirmados', value: '5', detail: 'exemplo' },
      { label: 'Pendentes', value: '1', detail: 'exemplo' },
      { label: 'Semana', value: '28', detail: 'exemplo' },
    ],
    emptyTitle: 'Agenda real da clínica',
    emptyDetail: 'Os horários acima são exemplos. A agenda conectada ao backend entra aqui.',
  },
  clientes: {
    columns: [
      { id: 'primary', label: 'Cliente', rowHeader: true },
      { id: 'secondary', label: 'Último cuidado' },
      { id: 'meta', label: 'Desde' },
      { id: 'status', label: 'Situação' },
    ],
    rows: [
      {
        id: 'jl',
        primary: 'Juliana Lima',
        secondary: 'Depilação a laser',
        meta: '2024',
        status: 'Ativa',
      },
      {
        id: 'cs',
        primary: 'Camila Santos',
        secondary: 'Limpeza de pele',
        meta: '2025',
        status: 'Ativa',
      },
      {
        id: 'ba',
        primary: 'Beatriz Alves',
        secondary: 'Design de sobrancelhas',
        meta: '2023',
        status: 'Ativa',
      },
      {
        id: 'mc',
        primary: 'Mariana Costa',
        secondary: 'Massagem relaxante',
        meta: '2026',
        status: 'Nova',
      },
    ],
    stats: [
      { label: 'Ativas', value: '128', detail: 'exemplo' },
      { label: 'Novas no mês', value: '6', detail: 'exemplo' },
      { label: 'Aniversariantes', value: '3', detail: 'exemplo' },
      { label: 'Sem visita', value: '4', detail: 'exemplo' },
    ],
    emptyTitle: 'Clientes da clínica',
    emptyDetail: 'A lista acima é ilustrativa. O cadastro real de clientes entra neste espaço.',
  },
  servicos: {
    columns: [
      { id: 'primary', label: 'Serviço', rowHeader: true },
      { id: 'secondary', label: 'Duração' },
      { id: 'meta', label: 'Preço' },
      { id: 'status', label: 'Situação' },
    ],
    rows: [
      {
        id: 'laser',
        primary: 'Depilação a laser',
        secondary: '40 min',
        meta: 'R$ 180',
        status: 'Ativo',
      },
      {
        id: 'pele',
        primary: 'Limpeza de pele',
        secondary: '60 min',
        meta: 'R$ 220',
        status: 'Ativo',
      },
      {
        id: 'sob',
        primary: 'Design de sobrancelhas',
        secondary: '30 min',
        meta: 'R$ 70',
        status: 'Ativo',
      },
      {
        id: 'massagem',
        primary: 'Massagem relaxante',
        secondary: '50 min',
        meta: 'R$ 160',
        status: 'Rascunho',
      },
    ],
    stats: [
      { label: 'No catálogo', value: '18', detail: 'exemplo' },
      { label: 'Ativos', value: '16', detail: 'exemplo' },
      { label: 'Duração média', value: '45 min', detail: 'exemplo' },
      { label: 'Mais pedido', value: 'Laser', detail: 'exemplo' },
    ],
    emptyTitle: 'Catálogo real',
    emptyDetail: 'Estes serviços são exemplos. Os cadastrados na clínica ficam em Configurações.',
  },
  financeiro: {
    columns: [
      { id: 'primary', label: 'Lançamento', rowHeader: true },
      { id: 'secondary', label: 'Origem' },
      { id: 'meta', label: 'Valor' },
      { id: 'status', label: 'Situação' },
    ],
    rows: [
      {
        id: '1',
        primary: 'Atendimento 09:00',
        secondary: 'Juliana Lima',
        meta: 'R$ 180',
        status: 'Recebido',
      },
      {
        id: '2',
        primary: 'Atendimento 10:30',
        secondary: 'Camila Santos',
        meta: 'R$ 220',
        status: 'Recebido',
      },
      {
        id: '3',
        primary: 'Atendimento 14:30',
        secondary: 'Mariana Costa',
        meta: 'R$ 160',
        status: 'Pendente',
      },
      {
        id: '4',
        primary: 'Produto balcão',
        secondary: 'Gel hidratante',
        meta: 'R$ 48',
        status: 'Recebido',
      },
    ],
    stats: [
      { label: 'Hoje', value: 'R$ 1.240', detail: 'exemplo' },
      { label: 'Recebido', value: 'R$ 1.080', detail: 'exemplo' },
      { label: 'Pendente', value: 'R$ 160', detail: 'exemplo' },
      { label: 'Ticket', value: 'R$ 206', detail: 'exemplo' },
    ],
    emptyTitle: 'Movimento real',
    emptyDetail:
      'Os valores acima são ilustrativos. O financeiro da clínica ainda não está ligado.',
  },
  estoque: {
    columns: situation.map((column, index) =>
      index === 0
        ? { ...column, label: 'Produto' }
        : index === 1
          ? { ...column, label: 'Categoria' }
          : index === 2
            ? { ...column, label: 'Quantidade' }
            : column,
    ),
    rows: [
      { id: 'gel', primary: 'Gel hidratante', secondary: 'Pele', meta: '3 un', status: 'Baixo' },
      {
        id: 'cera',
        primary: 'Cera depilatória',
        secondary: 'Depilação',
        meta: '12 un',
        status: 'Ok',
      },
      { id: 'luva', primary: 'Luvas', secondary: 'Descartáveis', meta: '40 un', status: 'Ok' },
      {
        id: 'oleo',
        primary: 'Óleo de massagem',
        secondary: 'Corpo',
        meta: '2 un',
        status: 'Baixo',
      },
    ],
    stats: [
      { label: 'Itens', value: '42', detail: 'exemplo' },
      { label: 'Baixo', value: '3', detail: 'exemplo' },
      { label: 'A vencer', value: '1', detail: 'exemplo' },
      { label: 'Reposições', value: '2', detail: 'exemplo' },
    ],
    emptyTitle: 'Estoque da clínica',
    emptyDetail: 'A tabela é um exemplo. O controle real de produtos entra neste card.',
  },
  marketing: {
    columns: [
      { id: 'primary', label: 'Campanha', rowHeader: true },
      { id: 'secondary', label: 'Canal' },
      { id: 'meta', label: 'Quando' },
      { id: 'status', label: 'Situação' },
    ],
    rows: [
      {
        id: 'retorno',
        primary: 'Volte a se cuidar',
        secondary: 'Lembrete',
        meta: 'Esta semana',
        status: 'Rascunho',
      },
      {
        id: 'niver',
        primary: 'Aniversário do mês',
        secondary: 'Mensagem',
        meta: 'Março',
        status: 'Agendada',
      },
      {
        id: 'laser',
        primary: 'Laser em destaque',
        secondary: 'Novidade',
        meta: 'Abril',
        status: 'Rascunho',
      },
    ],
    stats: [
      { label: 'Rascunhos', value: '2', detail: 'exemplo' },
      { label: 'Agendadas', value: '1', detail: 'exemplo' },
      { label: 'Enviadas', value: '0', detail: 'exemplo' },
      { label: 'Alcance', value: '—', detail: 'exemplo' },
    ],
    emptyTitle: 'Campanhas reais',
    emptyDetail: 'Nenhuma campanha foi enviada. Este espaço espera o fluxo de comunicação.',
  },
  relatorios: {
    columns: [
      { id: 'primary', label: 'Relatório', rowHeader: true },
      { id: 'secondary', label: 'Período' },
      { id: 'meta', label: 'Leitura' },
      { id: 'status', label: 'Situação' },
    ],
    rows: [
      {
        id: 'dia',
        primary: 'Movimento do dia',
        secondary: 'Hoje',
        meta: '6 atendimentos',
        status: 'Exemplo',
      },
      {
        id: 'semana',
        primary: 'Semana',
        secondary: 'Últimos 7 dias',
        meta: 'R$ 8.450',
        status: 'Exemplo',
      },
      {
        id: 'servicos',
        primary: 'Serviços mais pedidos',
        secondary: 'Mês',
        meta: 'Laser',
        status: 'Exemplo',
      },
      {
        id: 'equipe',
        primary: 'Ocupação da equipe',
        secondary: 'Mês',
        meta: '72%',
        status: 'Exemplo',
      },
    ],
    stats: [
      { label: 'Agendamentos', value: '6', detail: 'exemplo' },
      { label: 'Faturamento', value: 'R$ 1.240', detail: 'exemplo' },
      { label: 'Novos clientes', value: '2', detail: 'exemplo' },
      { label: 'Avaliações', value: '4,9', detail: 'exemplo' },
    ],
    emptyTitle: 'Relatório exportável',
    emptyDetail: 'Os números são ilustrativos. A exportação real ainda não está disponível.',
  },
}

export function sectionSearchExamples(id: ManagerSectionId): { title: string; detail: string }[] {
  if (id === 'inicio') {
    return demoAppointments.map((item) => ({
      title: item.name,
      detail: `${item.time} · ${item.service}`,
    }))
  }
  if (id === 'configuracoes') return []
  return sectionSketches[id].rows.map((row) => ({
    title: row.primary,
    detail: `${row.secondary} · ${row.meta}`,
  }))
}
