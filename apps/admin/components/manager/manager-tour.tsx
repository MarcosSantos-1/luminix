'use client'

import { Button } from '@heroui/react'
import { ArrowRight, ChevronDown, ChevronUp, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ManagerSectionId } from './demo-data'
import './manager-tour.css'

type TourStep = {
  section: ManagerSectionId
  title: string
  description: string
}

const steps: readonly TourStep[] = [
  {
    section: 'inicio',
    title: 'Conheça seu painel',
    description:
      'O Início reúne os atalhos da rotina. Use o menu ou a busca para encontrar uma seção.',
  },
  {
    section: 'agenda',
    title: 'Organize sua agenda semanal',
    description:
      'Passe pelas semanas e use Horários para ajustar o expediente e as pausas. Para marcar um atendimento, escolha Novo agendamento.',
  },
  {
    section: 'clientes',
    title: 'Cadastre e receba clientes',
    description:
      'Use Adicionar cliente para cadastrar alguém. Para apresentar seu espaço, compartilhe o link da vitrine publicada. O envio de convites pelo painel está em preparação.',
  },
  {
    section: 'servicos',
    title: 'Confira seu catálogo',
    description:
      'A seção Serviços mostra uma prévia. Quem gerencia o espaço pode consultar o catálogo em Configurações, em Cadastro da clínica. A edição de serviços pelo painel está em preparação.',
  },
  {
    section: 'configuracoes',
    title: 'Personalize sua vitrine',
    description:
      'Em Página pública do espaço, revise a publicação, abra a página pública e use Editar vitrine para trocar a capa, destacar serviços ou incluir fotos.',
  },
  {
    section: 'estoque',
    title: 'Conheça a área de estoque',
    description:
      'Veja onde ficarão os produtos e as reposições. Os itens desta prévia são exemplos.',
  },
  {
    section: 'marketing',
    title: 'Conheça a área de marketing',
    description:
      'Veja onde ficarão campanhas e recados. A criação e o envio de campanhas estão em preparação.',
  },
  {
    section: 'configuracoes',
    title: 'Encontre as configurações do espaço',
    description:
      'Aqui você encontra os dados da clínica, a equipe, o código de acesso e o tema do painel. A agenda semanal é ajustada na seção Agenda.',
  },
]

export function ManagerTour({
  canManageSettings,
  onSection,
  onClose,
}: {
  canManageSettings: boolean
  onSection: (section: ManagerSectionId) => void
  onClose: () => void
}) {
  const available = canManageSettings
    ? steps
    : steps.filter(({ section }) => section !== 'configuracoes')
  const [position, setIndex] = useState(0)
  const [collapsed, setCollapsed] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const index = Math.min(position, available.length - 1)
  const step = available[index]
  const last = index === available.length - 1

  useEffect(() => {
    const frame = requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(frame)
  }, [])

  function goTo(next: number) {
    setIndex(next)
    onSection(available[next].section)
  }

  return (
    <aside
      className="manager-tour"
      aria-labelledby="manager-tour-title"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <div className="manager-tour-header">
        <h2 id="manager-tour-title" tabIndex={-1} ref={heading}>
          Tour do painel{' '}
          <span>
            · {index + 1} de {available.length}
          </span>
        </h2>
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label={collapsed ? 'Expandir tour' : 'Recolher tour'}
          aria-expanded={!collapsed}
          aria-controls="manager-tour-content"
          onPress={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
        </Button>
        <Button isIconOnly size="sm" variant="ghost" aria-label="Fechar tour" onPress={onClose}>
          <X size={17} />
        </Button>
      </div>
      <div id="manager-tour-content" className="manager-tour-content" hidden={collapsed}>
        <div aria-live="polite" aria-atomic="true">
          <h3>{step.title}</h3>
          <p>{step.description}</p>
        </div>
        <div className="manager-tour-actions">
          {index > 0 && (
            <Button size="sm" variant="ghost" onPress={() => goTo(index - 1)}>
              Voltar
            </Button>
          )}
          <Button size="sm" onPress={last ? onClose : () => goTo(index + 1)}>
            {last ? 'Concluir tour' : 'Próximo'} <ArrowRight size={15} aria-hidden="true" />
          </Button>
        </div>
      </div>
    </aside>
  )
}
