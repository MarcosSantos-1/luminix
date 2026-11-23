'use client'

import { Button } from '@heroui/react'
import { Check, Package, Wallet } from 'lucide-react'
import { useState } from 'react'
import { showToast } from '@/components/ui/toast-notice'
import type { ClinicApi } from '../settings/clinic-api'
import { money } from './format'

/** A client's package as `clients/:id/packages` returns it. */
export type ClientPackage = {
  id: string
  serviceId: string
  name: string
  kind?: 'sessions' | 'combo'
  status: string
  sessionsTotal: number
  used: number
  done?: number
  left: number
  durationMinutes?: number | null
  items?: { serviceId: string; left: number; sessions?: number; used?: number }[]
  priceCents?: number | null
  paymentPlan?: 'paid' | 'per_visit' | 'later' | string
  paidCents?: number | null
  remainingCents?: number | null
  installmentCents?: number | null
  expiresOn?: string | null
  visits?: { id: string; number: number; startsAt: string; status: string }[]
}

const short = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })

/**
 * Compact, live picture of a package: one segment per session (done, booked, missed, still
 * free) and how much is paid. With money access, "Receber parcela" registers the next part
 * in the Financeiro (packages paid a bit at each visit).
 */
export function PackageProgress({
  api,
  item,
  canCharge,
  appointmentId,
  onChanged,
  compact,
  hideCharge,
}: {
  api?: ClinicApi
  item: ClientPackage
  /** finance:manage: shows the money line and the payment button. */
  canCharge?: boolean
  /** Ties the installment to this visit. */
  appointmentId?: string
  onChanged?: () => void
  compact?: boolean
  /** Shows the balance without the "Receber" button (money is recorded after the visit). */
  hideCharge?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const visits = item.visits ?? []
  const [now] = useState(() => Date.now())
  const segments = Array.from({ length: item.sessionsTotal }, (_, index) => {
    const visit = visits[index]
    if (!visit) return { state: 'free' as const, label: `Sessão ${index + 1}: disponível` }
    const state =
      visit.status === 'completed'
        ? ('done' as const)
        : visit.status === 'no_show'
          ? ('missed' as const)
          : Date.parse(visit.startsAt) < now
            ? ('done' as const)
            : ('booked' as const)
    const word = { done: 'feita', missed: 'falta', booked: 'marcada' }[state]
    return { state, label: `Sessão ${index + 1}: ${word} em ${short(visit.startsAt)}` }
  })
  const remaining = item.remainingCents ?? null
  const installment =
    remaining != null && item.installmentCents
      ? Math.min(remaining, item.installmentCents)
      : remaining
  const paidOff = remaining === 0
  const next = visits.find((visit) => Date.parse(visit.startsAt) >= now)

  async function charge() {
    if (!api || !installment || busy) return
    setBusy(true)
    try {
      await api.post(`client-packages/${item.id}/payments`, {
        amountCents: installment,
        method: 'pix',
        occurredOn: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }),
        ...(appointmentId ? { appointmentId } : {}),
      })
      showToast(`${money(installment)} recebido do pacote ${item.name}. Já está no Financeiro.`)
      onChanged?.()
    } catch {
      showToast('Não foi possível registrar o pagamento do pacote.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`pkp${compact ? ' is-compact' : ''}`}>
      <div className="pkp-head">
        <span className="pkp-icon" aria-hidden>
          <Package size={16} />
        </span>
        <strong>{item.name}</strong>
        <em>
          {item.used}/{item.sessionsTotal}
        </em>
      </div>
      <ol
        className="pkp-bar"
        aria-label={`${item.used} de ${item.sessionsTotal} sessões usadas, ${item.left} restantes`}
      >
        {segments.map((segment, index) => (
          <li key={index} data-state={segment.state} title={segment.label}>
            {segment.state === 'done' ? <Check size={10} strokeWidth={3} aria-hidden /> : null}
          </li>
        ))}
      </ol>
      <p className="pkp-meta">
        {item.left === 0
          ? 'Todas as sessões usadas'
          : `${item.left === 1 ? 'Resta 1 sessão' : `Restam ${item.left} sessões`}`}
        {next ? ` · próxima ${short(next.startsAt)}` : ''}
      </p>
      {canCharge && remaining != null ? (
        <div className={`pkp-money${paidOff ? ' is-paid' : ''}`}>
          <Wallet size={14} aria-hidden />
          <span>
            {paidOff
              ? 'Pacote pago'
              : `${money(item.paidCents ?? 0)} pago · faltam ${money(remaining)}`}
            {!paidOff && item.paymentPlan === 'per_visit' ? ' · paga a cada sessão' : ''}
          </span>
          {!paidOff && api && installment && !hideCharge ? (
            <Button size="sm" className="lx-laser" isDisabled={busy} onPress={() => void charge()}>
              {busy ? 'Registrando…' : `Receber ${money(installment)}`}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
