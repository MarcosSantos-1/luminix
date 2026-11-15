'use client'

import { useRef, useState, type ReactNode } from 'react'
import { Play, X } from 'lucide-react'
import { DEMO_VIDEO_EMBED_URL } from '../../lib/site'

export function VideoButton({
  children,
  className = 'lp-play',
}: {
  children: ReactNode
  className?: string
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)

  function show() {
    setOpen(true)
    dialogRef.current?.showModal()
  }

  return (
    <>
      <button type="button" className={className} onClick={show}>
        <span className="lp-play-icon" aria-hidden>
          <Play size={16} fill="currentColor" />
        </span>
        <span>{children}</span>
      </button>
      <dialog
        ref={dialogRef}
        className="lp-video-dialog"
        aria-label="Vídeo de apresentação do Luminix"
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current?.close()
        }}
      >
        <div className="lp-video-frame">
          <button
            type="button"
            className="lp-video-close"
            aria-label="Fechar vídeo"
            onClick={() => dialogRef.current?.close()}
          >
            <X size={20} aria-hidden />
          </button>
          {open && DEMO_VIDEO_EMBED_URL ? (
            <iframe
              src={`${DEMO_VIDEO_EMBED_URL}${DEMO_VIDEO_EMBED_URL.includes('?') ? '&' : '?'}autoplay=1`}
              title="Conheça o Luminix"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <div className="lp-video-empty">
              <span className="lp-play-icon" aria-hidden>
                <Play size={22} fill="currentColor" />
              </span>
              <strong>Vídeo em produção</strong>
              <p>Em breve, um tour de 2 minutos pelo Luminix aparece aqui.</p>
            </div>
          )}
        </div>
      </dialog>
    </>
  )
}
