'use client'

import { Button } from '@heroui/react'
import { useEffect, useRef } from 'react'
import {
  Building2,
  CalendarDays,
  Globe,
  Mail,
  Palette,
  ShieldCheck,
  UsersRound,
} from 'lucide-react'

export const managerSettingsSections = [
  {
    id: 'espaco',
    label: 'Dados do espaço',
    icon: Building2,
    hint: 'Nome, logo, código do espaço e endereço.',
  },
  { id: 'contato', label: 'Contato', icon: Mail, hint: 'Telefone, WhatsApp, e-mail e redes.' },
  {
    id: 'vitrine',
    label: 'Vitrine e site',
    icon: Globe,
    hint: 'O que as clientes veem no seu site e no app.',
  },
  {
    id: 'regras',
    label: 'Regras e combinados',
    icon: ShieldCheck,
    hint: 'Cancelamento, atrasos, sinal e políticas.',
  },
  {
    id: 'personalizacao',
    label: 'Personalização e idioma',
    icon: Palette,
    hint: 'Cores do painel e como o Luminix fala com você.',
  },
  {
    id: 'equipe',
    label: 'Equipe',
    icon: UsersRound,
    hint: 'Funcionários, atendimentos, horários, comissões e acesso ao painel.',
  },
  { id: 'rotina', label: 'Rotina', icon: CalendarDays, hint: 'Horário de funcionamento e pausas.' },
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
  const nav = useRef<HTMLElement>(null)
  // On a phone the tabs slide sideways: keep the open one in view.
  useEffect(() => {
    const active = nav.current?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!active || !nav.current || nav.current.scrollWidth <= nav.current.clientWidth) return
    nav.current.scrollTo({
      left: active.offsetLeft - (nav.current.clientWidth - active.offsetWidth) / 2,
      behavior: 'smooth',
    })
  }, [current])
  const section = managerSettingsSections.find(({ id }) => id === current)
  const SectionIcon = section?.icon
  return (
    <>
      <nav ref={nav} className="manager-settings-nav" aria-label="Seções de configurações">
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
              <span className="msn-icon" aria-hidden="true">
                <Icon size={16} />
              </span>
              <span>{label}</span>
            </Button>
          ))}
      </nav>
      {section && SectionIcon ? (
        <header className="msn-head">
          <span className="msn-head-icon" aria-hidden="true">
            <SectionIcon size={22} />
          </span>
          <div>
            <h2>{section.label}</h2>
            <p>{section.hint}</p>
          </div>
        </header>
      ) : null}
    </>
  )
}
