'use client'

import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { initials } from '../../lib/client-app/format'
import type { Appointment, SpaceSummary } from '../../lib/client-app/types'

/* eslint-disable @next/next/no-img-element -- logos and photos are remote or data URLs of unknown size */

export function Avatar({
  name,
  photo,
  size = 44,
}: {
  name: string
  photo?: string | null
  size?: number
}) {
  return (
    <span className="ca-avatar" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {photo ? <img src={photo} alt="" /> : initials(name)}
    </span>
  )
}

export function SpaceLogo({ space, size = 44 }: { space: SpaceSummary; size?: number }) {
  return (
    <span
      className="ca-logo"
      data-theme={space.theme}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {space.logoUrl ? <img src={space.logoUrl} alt="" /> : initials(space.name)}
    </span>
  )
}

/** Asymmetric line work for the dark blocks. Decorative only. */
export function Lines() {
  return (
    <svg
      className="ca-lines"
      viewBox="0 0 400 220"
      preserveAspectRatio="xMaxYMid slice"
      aria-hidden
    >
      {Array.from({ length: 9 }, (_, index) => (
        <path
          key={index}
          d={`M${150 + index * 9} ${230} C ${210 + index * 14} ${120 - index * 6}, ${300 - index * 8} ${150 + index * 5}, ${420} ${-10 + index * 17}`}
        />
      ))}
    </svg>
  )
}

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])
  return (
    <div className="ca-sheet-wrap" onClick={onClose}>
      <div
        className="ca-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <button type="button" className="ca-icon-button" aria-label="Fechar" onClick={onClose}>
            <X size={18} aria-hidden />
          </button>
        </header>
        {children}
      </div>
    </div>
  )
}

/** A confirmed appointment whose time has passed is shown as done. */
export function displayStatus(appointment: Appointment, now = new Date()) {
  const ended =
    new Date(appointment.start).getTime() + appointment.durationMinutes * 60_000 < now.getTime()
  if (appointment.status === 'confirmed' && ended) return 'done' as const
  if (appointment.status === 'requested' && ended) return 'cancelled' as const
  return appointment.status
}

const statusText = {
  requested: 'A confirmar',
  confirmed: 'Confirmado',
  done: 'Realizado',
  cancelled: 'Cancelado',
} as const

export function StatusBadge({ appointment }: { appointment: Appointment }) {
  const status = displayStatus(appointment)
  return (
    <span className="ca-badge" data-status={status}>
      {statusText[status]}
    </span>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="ca-empty">
      <strong>{title}</strong>
      {children}
    </div>
  )
}

export function PageHeader({
  title,
  kicker,
  action,
}: {
  title: string
  kicker?: string
  action?: ReactNode
}) {
  return (
    <header className="ca-page-header">
      <div>
        {kicker && <p>{kicker}</p>}
        <h1>{title}</h1>
      </div>
      {action}
    </header>
  )
}
