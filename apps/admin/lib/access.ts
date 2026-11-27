/**
 * Single source for "who sees what" in the admin. The API enforces the same permissions
 * (migrations 0025, 0052 and 0053, role presets); this file only hides what the person cannot use.
 */
import type { ManagerSectionId } from '@/components/manager/demo-data'
import type { ManagerSettingsSection } from '@/components/manager/manager-settings-nav'

export type AccessRole = 'owner' | 'manager' | 'team'

export const accessRoles: { id: AccessRole; label: string; summary: string }[] = [
  {
    id: 'owner',
    label: 'Proprietária',
    summary: 'Dona do espaço. Pode tudo, inclusive dar e tirar acesso de gerente.',
  },
  {
    id: 'manager',
    label: 'Gerente',
    summary: 'Pode tudo, como a dona: financeiro, relatórios, configurações e acessos.',
  },
  {
    id: 'team',
    label: 'Equipe',
    summary: 'Recepção e profissionais. Pode o que você liberar logo abaixo.',
  },
]

/**
 * Options the owner/manager switch for Equipe (Configurações → Acessos). The API keeps the
 * whitelist and the defaults (role_optional_permissions); this only names them, in the
 * order shown.
 */
export const accessOptions: { permission: string; title: string; description: string }[] = [
  {
    permission: 'agenda:manage',
    title: 'Marcar e remarcar atendimentos',
    description: 'Criar, mudar e cancelar horários na agenda.',
  },
  {
    permission: 'client:manage',
    title: 'Cadastrar e editar clientes',
    description: 'Ver sempre pode; aqui é criar e alterar cadastros.',
  },
  {
    permission: 'service:manage',
    title: 'Serviços, pacotes e promoções',
    description: 'Criar e editar serviços, preços, pacotes e promoções.',
  },
  {
    permission: 'inventory:manage',
    title: 'Estoque',
    description: 'Produtos, entradas, saídas e validade.',
  },
  {
    permission: 'marketing:manage',
    title: 'Marketing',
    description: 'Planejar e editar posts e campanhas.',
  },
  {
    permission: 'media:manage',
    title: 'Enviar fotos e mídias',
    description: 'Adicionar e organizar o acervo de fotos.',
  },
  {
    permission: 'schedule:manage',
    title: 'Horários e dias fechados',
    description: 'Mudar o horário de funcionamento e fechar ou abrir dias avulsos.',
  },
  {
    permission: 'vacation:manage',
    title: 'Férias e afastamentos',
    description: 'Lançar férias (individuais ou coletivas), licenças e luto.',
  },
]

export function roleLabel(role: string) {
  return accessRoles.find((item) => item.id === role)?.label ?? role
}

const sectionPermissions: Record<ManagerSectionId, string[]> = {
  inicio: [],
  agenda: ['agenda:read'],
  clientes: ['client:read'],
  servicos: ['agenda:read'],
  financeiro: ['finance:manage', 'settings:manage'],
  estoque: ['inventory:manage'],
  marketing: ['marketing:manage', 'client:read'],
  relatorios: ['finance:manage'],
  midia: ['media:read'],
  configuracoes: ['settings:manage', 'team:manage', 'professional:manage'],
}

/** A section is visible when the person has at least one of its permissions. */
export function allowedSections(permissions: string[]): ManagerSectionId[] {
  return (Object.keys(sectionPermissions) as ManagerSectionId[]).filter((id) => {
    const needed = sectionPermissions[id]
    return !needed.length || needed.some((permission) => permissions.includes(permission))
  })
}

const settingsPermissions: Record<ManagerSettingsSection, string> = {
  espaco: 'settings:manage',
  contato: 'settings:manage',
  vitrine: 'settings:manage',
  regras: 'settings:manage',
  personalizacao: 'settings:manage',
  equipe: 'professional:manage',
  rotina: 'schedule:manage',
}

export function allowedSettings(permissions: string[]): ManagerSettingsSection[] {
  return (Object.keys(settingsPermissions) as ManagerSettingsSection[]).filter((id) =>
    permissions.includes(settingsPermissions[id]),
  )
}
