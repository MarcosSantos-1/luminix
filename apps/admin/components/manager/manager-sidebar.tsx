'use client'

import Image from 'next/image'
import { Button, Card } from '@heroui/react'
import { Crown, MessageCircle, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { managerNavigation } from './demo-data'
import { supportWhatsAppUrl } from './support'

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
      <div className="manager-sidebar-top">
        <Button
          variant="ghost"
          className="manager-brand"
          aria-label="Luminix — início"
          onPress={() => onNavigate('Início')}
        >
          <Image src="/brand/logo.png" width={35} height={43} alt="" />
          <span>Luminix</span>
        </Button>
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          className="manager-collapse"
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          aria-expanded={!collapsed}
          onPress={onToggle}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </Button>
      </div>
      <div className="manager-sidebar-scroll">
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
      </div>
      <div className="manager-support">
        <a
          href={supportWhatsAppUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Suporte: perguntar no WhatsApp"
          title="Suporte no WhatsApp"
        >
          <MessageCircle size={18} aria-hidden />
          <span>
            <strong>Suporte</strong>
            <small>Perguntar no WhatsApp</small>
          </span>
        </a>
      </div>
    </aside>
  )
}
