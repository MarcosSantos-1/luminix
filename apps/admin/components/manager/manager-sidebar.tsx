'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Button, Card } from '@heroui/react'
import { ChevronLeft, ChevronRight, Crown, LogOut } from 'lucide-react'
import { managerNavigation, supportNavigation } from './demo-data'

export function ManagerSidebar({
  collapsed,
  onToggle,
  onNavigate,
}: {
  collapsed: boolean
  onToggle: () => void
  onNavigate: (label: string) => void
}) {
  return (
    <aside className="manager-sidebar">
      <Link href="/dashboard" className="manager-brand" aria-label="Luminix — início">
        <Image src="/brand/logo.png" width={35} height={43} alt="" />
        <span>Luminix</span>
      </Link>
      <nav aria-label="Navegação do gestor" className="manager-nav">
        {managerNavigation.map(({ label, icon: Icon }) => (
          <Button
            key={label}
            variant="ghost"
            className={`manager-nav-item ${label === 'Início' ? 'is-active' : ''}`}
            aria-label={label}
            aria-current={label === 'Início' ? 'page' : undefined}
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
        <Link href="/clinics" aria-label="Minhas clínicas">
          <LogOut size={18} />
          <span>Minhas clínicas</span>
        </Link>
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
