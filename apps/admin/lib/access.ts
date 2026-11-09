/**
 * Single source for "who sees what" in the admin. The API enforces the same permissions
 * (migration 0025, role presets); this file only hides what the person cannot use.
 */
import type { ManagerSectionId } from '@/components/manager/demo-data'
import type { ManagerSettingsSection } from '@/components/manager/manager-settings-nav'

export type AccessRole = 'owner' | 'manager' | 'reception' | 'professional'

export const accessRoles: {
  id: AccessRole
  label: string
  summary: string
  can: string[]
  cannot: string[]
}[] = [
  {
    id: 'owner',
    label: 'Proprietária',
    summary: 'Dona do espaço. Pode tudo, inclusive dar acesso de gerente.',
    can: ['Tudo do painel', 'Dar e tirar acessos', 'Pagamentos e site'],
    cannot: [],
  },
  {
    id: 'manager',
    label: 'Gerente',
    summary: 'Cuida do dia a dia como a dona, menos o cadastro inicial.',
    can: ['Agenda e clientes', 'Equipe e acessos', 'Configurações e site'],
    cannot: ['Criar outros gerentes'],
  },
  {
    id: 'reception',
    label: 'Recepção',
    summary: 'Marca horários e cadastra clientes.',
    can: ['Agenda (ver e marcar)', 'Clientes'],
    cannot: ['Configurações', 'Financeiro', 'Equipe'],
  },
  {
    id: 'professional',
    label: 'Profissional',
    summary: 'Vê a agenda e os dados das clientes, sem alterar nada.',
    can: ['Ver agenda', 'Ver clientes'],
    cannot: ['Marcar horários', 'Configurações', 'Financeiro'],
  },
]

export function roleLabel(role: string) {
  return accessRoles.find((item) => item.id === role)?.label ?? role
}

const sectionPermissions: Record<ManagerSectionId, string[]> = {
  inicio: [],
  agenda: ['agenda:read'],
  clientes: ['client:read'],
  servicos: ['clinic:manage'],
  financeiro: ['settings:manage'],
  estoque: ['clinic:manage'],
  marketing: ['clinic:manage'],
  relatorios: ['clinic:manage'],
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
  acessos: 'team:manage',
  rotina: 'clinic:manage',
}

export function allowedSettings(permissions: string[]): ManagerSettingsSection[] {
  return (Object.keys(settingsPermissions) as ManagerSettingsSection[]).filter((id) =>
    permissions.includes(settingsPermissions[id]),
  )
}
