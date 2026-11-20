'use client'

import Image from 'next/image'
import { Button, Card } from '@heroui/react'
import { Crown, MessageCircle, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { managerNavigation, type ManagerSectionId } from './demo-data'
import { supportWhatsAppUrl } from './support'

/** Menu groups: the day-to-day pages first, then the business, then the space. */
const groups: { label: string; ids: ManagerSectionId[] }[] = [
  { label: 'Dia a dia', ids: ['inicio', 'agenda', 'clientes', 'servicos'] },
  { label: 'Negócio', ids: ['financeiro', 'estoque', 'marketing', 'relatorios', 'midia'] },
  { label: 'Espaço', ids: ['configuracoes'] },
]

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
          {groups.map((group) => {
            const items = managerNavigation.filter(
              (item) =>
                group.ids.includes(item.id) && (item.id !== 'configuracoes' || canManageSettings),
            )
            if (!items.length) return null
            return (
              <div
                key={group.label}
                className="manager-nav-group"
                role="group"
                aria-label={group.label}
              >
                <p className="manager-nav-label" aria-hidden="true">
                  {group.label}
                </p>
                {items.map(({ id, label, icon: Icon }) => (
                  <Button
                    key={id}
                    variant="ghost"
                    className={`manager-nav-item ${label === activeLabel ? 'is-active' : ''}`}
                    aria-label={label}
                    aria-current={label === activeLabel ? 'page' : undefined}
                    onPress={() => onNavigate(label)}
                  >
                    <span className="manager-nav-icon" aria-hidden="true">
                      <Icon size={18} />
                    </span>
                    <span>{label}</span>
                  </Button>
                ))}
              </div>
            )
          })}
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
          <span className="manager-support-icon" aria-hidden>
            <MessageCircle size={18} />
          </span>
          <span>
            <strong>Suporte</strong>
            <small>Perguntar no WhatsApp</small>
          </span>
        </a>
      </div>
    </aside>
  )
}
