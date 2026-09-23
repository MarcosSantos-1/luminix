'use client'

import Image from 'next/image'
import { Button, Card } from '@heroui/react'
import { ChevronLeft, ChevronRight, Crown } from 'lucide-react'
import { managerNavigation, supportNavigation } from './demo-data'

export function ManagerSidebar({
  activeLabel,
  canManageSettings,
  collapsed,
  onToggle,
  onNavigate,
}: {
  activeLabel: string
  canManageSettings: boolean
  collapsed: boolean
  onToggle: () => void
  onNavigate: (label: string) => void
}) {
  return (
    <aside className="manager-sidebar">
      <Button
        variant="ghost"
        className="manager-brand"
        aria-label="Luminix — início"
        onPress={() => onNavigate('Início')}
      >
        <Image src="/brand/logo.png" width={35} height={43} alt="" />
        <span>Luminix</span>
      </Button>
      <nav aria-label="Navegação do gestor" className="manager-nav">
        {managerNavigation
          .filter((item) => item.id !== 'configuracoes' || canManageSettings)
          .map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              variant="ghost"
              className={`manager-nav-item ${label === activeLabel ? 'is-active' : ''}`}
              aria-label={label}
              aria-current={label === activeLabel ? 'page' : undefined}
              onPress={() => onNavigate(label)}
            >
              <Icon size={20} />
              <span>{label}</span>
            </Button>
          ))}
      </nav>
      <Card className="manager-plan">
        <Crown size={20} />
        <p>Seu próximo capítulo</p>
        <strong>Mais tempo para cuidar.</strong>
        <p>Uma rotina mais leve começa aqui.</p>
        <Button variant="secondary" onPress={() => onNavigate('Planos')}>
          Conhecer os planos
        </Button>
      </Card>
      <div className="manager-support">
        {supportNavigation.map(({ label, icon: Icon }) => (
          <Button key={label} variant="ghost" aria-label={label} onPress={() => onNavigate(label)}>
            <Icon size={18} />
            <span>{label}</span>
          </Button>
        ))}
      </div>
      <Button
        className="manager-collapse"
        variant="secondary"
        aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
        aria-expanded={!collapsed}
        onPress={onToggle}
      >
        {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        <span>Recolher menu</span>
      </Button>
    </aside>
  )
}
