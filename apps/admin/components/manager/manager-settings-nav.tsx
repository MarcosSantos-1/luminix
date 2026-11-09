'use client'

import { Button } from '@heroui/react'
import {
  Building2,
  CalendarDays,
  Globe,
  KeyRound,
  Mail,
  Palette,
  ShieldCheck,
  UsersRound,
} from 'lucide-react'

export const managerSettingsSections = [
  { id: 'espaco', label: 'Dados do espaço', icon: Building2 },
  { id: 'contato', label: 'Contato', icon: Mail },
  { id: 'vitrine', label: 'Vitrine e site', icon: Globe },
  { id: 'regras', label: 'Regras e combinados', icon: ShieldCheck },
  { id: 'personalizacao', label: 'Personalização e idioma', icon: Palette },
  { id: 'equipe', label: 'Equipe e horários', icon: UsersRound },
  { id: 'acessos', label: 'Acessos e logins', icon: KeyRound },
  { id: 'rotina', label: 'Rotina', icon: CalendarDays },
] as const

export type ManagerSettingsSection = (typeof managerSettingsSections)[number]['id']

export function ManagerSettingsNav({
  current,
  onSelect,
  visible,
}: {
  current: ManagerSettingsSection
  onSelect: (section: ManagerSettingsSection) => void
  /** Tabs the person may open; all when omitted (demo). */
  visible?: ManagerSettingsSection[]
}) {
  return (
    <nav className="manager-settings-nav" aria-label="Seções de configurações">
      {managerSettingsSections
        .filter(({ id }) => !visible || visible.includes(id))
        .map(({ id, label, icon: Icon }) => (
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
