'use client'

import { Button, Modal } from '@heroui/react'
import Image from 'next/image'
import { ArrowRight, Bell, ExternalLink, Globe, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { managerUpdates, welcomeMedia, type ManagerMessageMedia } from './manager-updates'
import './manager-message-modal.css'

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
  onShowcase,
}: {
  view: 'welcome' | 'updates'
  clinicName: string
  demoPublicUrl?: string
  getPublicUrl?: (signal: AbortSignal) => Promise<string | null>
  canManageSettings: boolean
  onClose: () => void
  onTour: () => void
  onShowcase: () => void
}) {
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
  const media = view === 'welcome' ? welcomeMedia : undefined
  const Icon = view === 'welcome' ? Sparkles : Bell

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
              {view === 'welcome' ? 'PRIMEIROS PASSOS' : 'ACOMPANHE O LUMINIX'}
            </p>
            <Modal.Heading>
              {view === 'welcome' ? 'Boas-vindas ao Luminix!' : 'Novidades e avisos'}
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body className="manager-message-body">
            {view === 'welcome' ? (
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
            {view === 'welcome' ? (
              <>
                <Button variant="ghost" onPress={onClose}>
                  Explorar por conta própria
                </Button>
                <Button onPress={onTour}>
                  Começar tour <ArrowRight size={16} aria-hidden="true" />
                </Button>
              </>
            ) : (
              <Button onPress={onClose}>Entendi</Button>
            )}
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
