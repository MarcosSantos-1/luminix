'use client'

import { Button, Modal } from '@heroui/react'
import Image from 'next/image'
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  CalendarDays,
  ExternalLink,
  Globe,
  Settings2,
  Sparkles,
  UsersRound,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { managerUpdates, welcomeMedia, type ManagerMessageMedia } from './manager-updates'
import './manager-message-modal.css'

const tour = [
  {
    section: 'agenda',
    title: 'Veja sua agenda',
    description:
      'Consulte a semana, confira os horários da equipe e use Novo agendamento para marcar um atendimento.',
    icon: CalendarDays,
  },
  {
    section: 'clientes',
    title: 'Organize seus clientes',
    description:
      'Busque quem já atende com você ou use Adicionar cliente para cadastrar alguém novo.',
    icon: UsersRound,
  },
  {
    section: 'configuracoes',
    title: 'Deixe a vitrine com a sua cara',
    description:
      'Em Página pública do espaço, você pode revisar a publicação, editar a capa e o tema e incluir fotos na galeria.',
    icon: Settings2,
  },
] as const

type TourSection = (typeof tour)[number]['section']

function MessageMedia({ src, still, alt }: ManagerMessageMedia) {
  return (
    <picture className="manager-message-media">
      <source media="(prefers-reduced-motion: reduce)" srcSet={still} />
      <Image src={src} alt={alt} width={720} height={280} unoptimized />
    </picture>
  )
}

export function ManagerMessageModal({
  view,
  clinicName,
  demoPublicUrl,
  getPublicUrl,
  canManageSettings,
  onClose,
  onTour,
  onSection,
  onFinish,
  onShowcase,
}: {
  view: 'welcome' | 'updates'
  clinicName: string
  demoPublicUrl?: string
  getPublicUrl?: (signal: AbortSignal) => Promise<string | null>
  canManageSettings: boolean
  onClose: () => void
  onTour: () => void
  onSection: (section: TourSection) => void
  onFinish: () => void
  onShowcase: () => void
}) {
  const [step, setStep] = useState<number | null>(null)
  const [copied, setCopied] = useState('')
  const [publicUrl, setPublicUrl] = useState(demoPublicUrl ?? null)
  useEffect(() => {
    if (view !== 'welcome' || !getPublicUrl) return
    const controller = new AbortController()
    void getPublicUrl(controller.signal)
      .then((url) => {
        if (!controller.signal.aborted) setPublicUrl(url)
      })
      .catch(() => {
        // Settings remains available if publication status cannot be loaded.
      })
    return () => controller.abort()
  }, [view, getPublicUrl])
  const totalSteps = canManageSettings ? tour.length : tour.length - 1
  const current = step === null ? null : tour[step]
  const media = view === 'welcome' && !current ? welcomeMedia : undefined
  const Icon = current?.icon ?? (view === 'welcome' ? Sparkles : Bell)

  function showStep(index: number) {
    setStep(index)
    onSection(tour[index].section)
  }

  async function copyLink() {
    if (!publicUrl) return
    try {
      await navigator.clipboard.writeText(publicUrl)
      setCopied('Link copiado.')
    } catch {
      setCopied('Abra a vitrine para copiar o endereço pelo navegador.')
    }
  }

  return (
    <Modal.Backdrop
      className="manager-message-backdrop"
      isOpen
      isDismissable={false}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Modal.Container size="md" scroll="inside">
        <Modal.Dialog className="manager-dialog manager-message">
          <Modal.CloseTrigger aria-label="Fechar" />
          <Modal.Header className="manager-message-header">
            {media ? (
              <MessageMedia {...media} />
            ) : (
              <div className="manager-message-art" aria-hidden="true">
                <span>
                  <Icon size={30} strokeWidth={1.5} />
                </span>
              </div>
            )}
            <p className="manager-message-kicker">
              {current && step !== null
                ? `Tour guiado · ${step + 1} de ${totalSteps}`
                : view === 'welcome'
                  ? 'PRIMEIROS PASSOS'
                  : 'ACOMPANHE O LUMINIX'}
            </p>
            <Modal.Heading>
              {current?.title ??
                (view === 'welcome' ? 'Boas-vindas ao Luminix!' : 'Novidades e avisos')}
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body className="manager-message-body">
            {current ? (
              <p aria-live="polite">{current.description}</p>
            ) : view === 'welcome' ? (
              <>
                <p>
                  <strong>{clinicName}</strong> já tem um painel para organizar a agenda, os
                  clientes e a página do espaço. Que tal conhecer o essencial antes do primeiro
                  atendimento?
                </p>
                {canManageSettings && (
                  <div className="manager-message-next">
                    <Globe size={20} aria-hidden="true" />
                    <div>
                      <strong>Compartilhe sua vitrine</strong>
                      <p>Revise o que aparece na página e personalize quando quiser.</p>
                      <div className="manager-message-links">
                        {publicUrl && (
                          <>
                            <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                              Abrir vitrine <ExternalLink size={13} aria-hidden="true" />
                            </a>
                            <Button size="sm" variant="ghost" onPress={() => void copyLink()}>
                              Copiar link
                            </Button>
                          </>
                        )}
                        <Button size="sm" variant="ghost" onPress={onShowcase}>
                          Configurar página
                        </Button>
                      </div>
                      {copied && <small role="status">{copied}</small>}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <ol className="manager-update-list">
                {managerUpdates.map(({ id, kind, title, summary, items, media }) => (
                  <li key={id}>
                    <span>{kind === 'notice' ? 'Aviso importante' : 'Atualização'}</span>
                    <h3>{title}</h3>
                    {media && <MessageMedia {...media} />}
                    <p>{summary}</p>
                    {items && (
                      <ul>
                        {items.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Modal.Body>
          <Modal.Footer className="manager-message-footer">
            {current && step !== null ? (
              <>
                <Button variant="ghost" onPress={onClose}>
                  Pular tour
                </Button>
                {step > 0 && (
                  <Button variant="secondary" onPress={() => showStep(step - 1)}>
                    <ArrowLeft size={16} aria-hidden="true" /> Voltar
                  </Button>
                )}
                <Button onPress={step + 1 === totalSteps ? onFinish : () => showStep(step + 1)}>
                  {step + 1 === totalSteps ? 'Concluir tour' : 'Próximo'}
                  <ArrowRight size={16} aria-hidden="true" />
                </Button>
              </>
            ) : view === 'welcome' ? (
              <>
                <Button variant="ghost" onPress={onClose}>
                  Explorar por conta própria
                </Button>
                <Button onPress={() => showStep(0)}>
                  Começar tour <ArrowRight size={16} aria-hidden="true" />
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onPress={onTour}>
                  Ver primeiros passos
                </Button>
                <Button onPress={onClose}>Entendi</Button>
              </>
            )}
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
