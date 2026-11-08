'use client'

import { Button } from '@heroui/react'
import { Building2, CalendarDays, Globe, Mail, Palette, Scissors, UsersRound } from 'lucide-react'

export const managerSettingsSections = [
  { id: 'espaco', label: 'Dados do espaço', icon: Building2 },
  { id: 'vitrine', label: 'Vitrine e site', icon: Globe },
  { id: 'personalizacao', label: 'Personalização', icon: Palette },
  { id: 'contato', label: 'Contato', icon: Mail },
  { id: 'equipe', label: 'Equipe', icon: UsersRound },
  { id: 'servicos', label: 'Serviços', icon: Scissors },
  { id: 'rotina', label: 'Rotina', icon: CalendarDays },
] as const

export type ManagerSettingsSection = (typeof managerSettingsSections)[number]['id']

export function ManagerSettingsNav({
  current,
  onSelect,
}: {
  current: ManagerSettingsSection
  onSelect: (section: ManagerSettingsSection) => void
}) {
  return (
    <nav className="manager-settings-nav" aria-label="Seções de configurações">
      {managerSettingsSections.map(({ id, label, icon: Icon }) => (
        <Button
          key={id}
          variant="secondary"
          aria-current={current === id ? 'page' : undefined}
          data-manager-spotlight={`settings-${id}`}
          onPress={() => onSelect(id)}
        >
          <Icon size={17} aria-hidden="true" /> {label}
        </Button>
      ))}
    </nav>
  )
}
