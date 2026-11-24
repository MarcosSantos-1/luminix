'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { CalendarClock, MapPin, ShieldCheck, X } from 'lucide-react'
import { effectivePrice, formatMoney, initials } from '../../lib/client-app/format'
import type { Appointment, BookingPolicy, SpaceSummary } from '../../lib/client-app/types'
import type { PublicService } from '../../lib/public-clinic'

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
  // Leaves with its own animation, then tells the page.
  const [closing, setClosing] = useState(false)
  const close = useCallback(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return onClose()
    setClosing(true)
    setTimeout(onClose, 200)
  }, [onClose])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [close])
  return (
    <div className="ca-sheet-wrap" data-closing={closing || undefined} onClick={close}>
      <div
        className="ca-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <button type="button" className="ca-icon-button" aria-label="Fechar" onClick={close}>
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

/** Google minimap that settles on the space address; pan and zoom stay available. */
export function SpaceMap({ space }: { space: SpaceSummary }) {
  const [loaded, setLoaded] = useState(false)
  if (!space.mapQuery) return null
  return (
    <div className="ca-map" data-loaded={loaded || undefined}>
      <iframe
        title={`Mapa da localização de ${space.name}`}
        src={`https://maps.google.com/maps?q=${encodeURIComponent(space.mapQuery)}&z=16&output=embed`}
        loading="lazy"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
      />
      {!loaded && (
        <div className="ca-map-loading" role="status">
          <span className="ca-map-pin">
            <MapPin size={22} aria-hidden />
          </span>
          Localizando {space.name}…
        </div>
      )}
    </div>
  )
}

const waitingSteps = [
  'Preparando o seu acesso…',
  'Buscando seus horários…',
  'Carregando serviços e pacotes…',
  'Quase lá…',
]

/**
 * The space's own loading screen. With `onDone` it is a short transition (entering a space);
 * without it, it stays while the space's data loads, telling what it is doing.
 */
export function Preparing({ space, onDone }: { space: SpaceSummary; onDone?: () => void }) {
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (!onDone) return
    const timer = setTimeout(onDone, 2200)
    return () => clearTimeout(timer)
  }, [onDone])
  useEffect(() => {
    if (onDone) return
    const timer = setInterval(
      () => setStep((value) => Math.min(value + 1, waitingSteps.length - 1)),
      1400,
    )
    return () => clearInterval(timer)
  }, [onDone])
  return (
    <div
      className="ca ca-preparing"
      data-theme={space.theme}
      data-waiting={onDone ? undefined : true}
      role="status"
    >
      <Lines />
      <span className="ca-preparing-glow" aria-hidden />
      <span className="ca-preparing-logo">
        <SpaceLogo space={space} size={84} />
      </span>
      <strong>{space.name}</strong>
      <p key={step} className="ca-preparing-step">
        {onDone ? waitingSteps[0] : waitingSteps[step]}
      </p>
      <span className="ca-preparing-bar" aria-hidden />
    </div>
  )
}

/** Deposit of a service right now (ADR-042): same share the API freezes at booking, or null. */
export function depositOf(
  service: Pick<PublicService, 'id' | 'priceType' | 'priceCents' | 'promoPriceCents'>,
  policy: BookingPolicy | null,
  percent = policy?.deposit?.percent,
) {
  if (!percent || service.priceType !== 'fixed') return null
  if (policy && !policy.deposit?.serviceIds.includes(service.id)) return null
  const price = effectivePrice(service as PublicService)
  if (price <= 0) return null
  return Math.min(price, Math.max(1, Math.round((price * percent) / 100)))
}

/** "Agenda especial" and "Sinal" tags on a service, shown wherever the client picks one. */
export function ServiceFlags({
  service,
  policy,
}: {
  service: PublicService
  policy: BookingPolicy | null
}) {
  const deposit = depositOf(service, policy)
  const special = service.bookingMode === 'manual_release'
  if (!deposit && !special) return null
  return (
    <span className="ca-flags">
      {special ? (
        <span className="ca-flag" data-kind="special" title="Só nos dias em que essa agenda abre">
          <CalendarClock size={12} aria-hidden /> Agenda especial
        </span>
      ) : null}
      {deposit ? (
        <span className="ca-flag" data-kind="deposit" title="Pede sinal para reservar">
          <ShieldCheck size={12} aria-hidden /> Sinal {formatMoney(deposit)}
        </span>
      ) : null}
    </span>
  )
}
