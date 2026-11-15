'use client'

import { useEffect, useState } from 'react'
import { MessageCircle, X } from 'lucide-react'
import { SUPPORT_WHATSAPP_URL } from '../../lib/site'

/**
 * Atendimento flutuante. Com `afterId`, só aparece quando esse elemento (o hero) sai da
 * tela. No celular é um ícone; no desktop, um cartão que pode ser recolhido.
 */
export function SupportFab({ afterId }: { afterId?: string }) {
  const [visible, setVisible] = useState(!afterId)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (!afterId) return
    const sentinel = document.getElementById(afterId)
    if (!sentinel) return
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry) return
      setVisible(!entry.isIntersecting)
    })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [afterId])

  return (
    <aside
      className="lp-fab"
      data-visible={visible}
      data-collapsed={collapsed}
      aria-label="Atendimento"
      inert={!visible}
    >
      <div className="lp-fab-card">
        <button
          type="button"
          className="lp-fab-dismiss"
          aria-label="Recolher atendimento"
          onClick={() => setCollapsed(true)}
        >
          <X size={14} aria-hidden />
        </button>
        <strong>Ficou com dúvida?</strong>
        <p>Fale com uma pessoa do time Luminix.</p>
        <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
          <MessageCircle size={16} aria-hidden /> Chamar no WhatsApp
        </a>
      </div>
      <a
        className="lp-fab-icon"
        href={SUPPORT_WHATSAPP_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Falar com atendente no WhatsApp"
      >
        <MessageCircle size={24} aria-hidden />
      </a>
    </aside>
  )
}
