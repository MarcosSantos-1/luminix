'use client'

import { Button } from '@heroui/react'
import { Check, Clock3, QrCode } from 'lucide-react'
import { useState } from 'react'
import { clock, dayLabel } from '../appointments/model'
import { QuickModal } from '../quick-modal'
import type { ClinicApi } from '../settings/clinic-api'
import { money } from './format'

export type PendingDeposit = {
  id: string
  startsAt: string
  client: string
  service: string
  cents: number
  status: 'awaiting' | 'reported'
  dueAt: string
  reportedAt: string | null
}

/**
 * "Sinais para conferir" (ADR-037): every Pix deposit still open, the ones the client says she
 * paid first. The team checks the bank statement and confirms here, one by one.
 */
export function DepositChecklist({
  api,
  isOpen,
  items,
  onOpenChange,
  onConfirmed,
}: {
  api: ClinicApi
  isOpen: boolean
  items: PendingDeposit[]
  onOpenChange: (open: boolean) => void
  onConfirmed: (message: string) => void
}) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  async function confirm(item: PendingDeposit) {
    setBusy(item.id)
    setError('')
    try {
      await api.post(`appointments/${item.id}/deposit/confirm`, {})
      onConfirmed(`Sinal de ${item.client} confirmado.`)
    } catch {
      setError('Não foi possível confirmar. A reserva pode ter expirado; abra a agenda.')
    } finally {
      setBusy('')
    }
  }

  return (
    <QuickModal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="lg"
      badge={
        <>
          <QrCode size={14} aria-hidden /> Sinal por Pix
        </>
      }
      title="Sinais para conferir"
      subtitle="Confira no extrato do seu banco antes de confirmar. Confirmado, o valor é descontado do total do atendimento."
    >
      {items.length ? (
        <ul className="deposit-list">
          {items.map((item) => (
            <li key={item.id} className={`is-${item.status}`}>
              <div>
                <strong>{item.client}</strong>
                <small>
                  {item.service} · {dayLabel(item.startsAt)} às {clock(item.startsAt)}
                </small>
                <span className="deposit-list-state">
                  {item.status === 'reported' ? (
                    <>
                      <Check size={13} aria-hidden /> Avisou que pagou
                    </>
                  ) : (
                    <>
                      <Clock3 size={13} aria-hidden /> Aguardando até {clock(item.dueAt)}
                    </>
                  )}
                </span>
              </div>
              <b>{money(item.cents)}</b>
              <Button size="sm" isDisabled={busy !== ''} onPress={() => void confirm(item)}>
                {busy === item.id ? 'Confirmando…' : 'Confirmar recebido'}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="settings-muted">Nenhum sinal pendente. Tudo conferido!</p>
      )}
      {error ? (
        <p className="apt-error" role="alert">
          {error}
        </p>
      ) : null}
    </QuickModal>
  )
}
