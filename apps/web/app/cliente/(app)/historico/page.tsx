'use client'

import Link from 'next/link'
import { useState } from 'react'
import { CalendarCheck, CreditCard, QrCode, ReceiptText, Store } from 'lucide-react'
import { paymentReceipt, useClient } from '../../../../lib/client-app/store'
import { toast } from '../../../../components/client-app/toast'
import { dateLabel, formatMoney, timeLabel } from '../../../../lib/client-app/format'
import { Empty, PageHeader, StatusBadge, displayStatus } from '../../../../components/client-app/ui'

const methodIcon = { pix: QrCode, card: CreditCard, local: Store }
const methodLabel = { pix: 'Pix', card: 'Cartão', local: 'No espaço' }
const paymentLabel = { paid: 'Pago', pending: 'A pagar no espaço', refunded: 'Estornado' }

export default function HistoryPage() {
  const { space } = useClient()
  const [tab, setTab] = useState<'visits' | 'payments'>('visits')
  const [opening, setOpening] = useState<string | null>(null)
  if (!space) return null

  /** Stripe's receipt in a new tab (opened right away so the browser does not block it). */
  async function openReceipt(appointmentId: string, paymentId: string) {
    if (!space) return
    const tab = window.open('', '_blank')
    setOpening(paymentId)
    const result = await paymentReceipt(space.summary.slug, appointmentId)
    setOpening(null)
    if (result.url) {
      if (tab) tab.location.href = result.url
      else window.location.assign(result.url)
      return
    }
    tab?.close()
    toast.error('Comprovante indisponível', result.error ?? undefined)
  }

  const visits = space.appointments
    .filter((item) => ['done', 'cancelled'].includes(displayStatus(item)))
    .sort((a, b) => b.start.localeCompare(a.start))
  const payments = [...space.payments].sort((a, b) => b.at.localeCompare(a.at))
  const done = visits.filter((item) => displayStatus(item) === 'done')
  const spent = payments
    .filter((item) => item.status === 'paid')
    .reduce((sum, item) => sum + item.amountCents, 0)

  return (
    <div className="ca-page">
      <PageHeader title="Histórico" kicker={space.summary.name} />
      <div className="ca-stats">
        <div>
          <small>Atendimentos realizados</small>
          <strong>{done.length}</strong>
        </div>
        <div>
          <small>Total pago</small>
          <strong>{formatMoney(spent)}</strong>
        </div>
        <div>
          <small>Última visita</small>
          <strong>{done[0] ? dateLabel(done[0].start, 'short') : '—'}</strong>
        </div>
      </div>

      <div className="ca-segment" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'visits'}
          onClick={() => setTab('visits')}
        >
          Atendimentos
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'payments'}
          onClick={() => setTab('payments')}
        >
          Pagamentos
        </button>
      </div>

      {tab === 'visits' &&
        (visits.length ? (
          <ul className="ca-list">
            {visits.map((item) => (
              <li key={item.id}>
                <span className="ca-list-icon">
                  <CalendarCheck size={18} aria-hidden />
                </span>
                <span className="ca-list-text">
                  <strong>{item.serviceName}</strong>
                  <small>
                    {dateLabel(item.start)} · {timeLabel(item.start)}
                  </small>
                </span>
                <span className="ca-list-end">
                  {item.priceCents > 0 && <b>{formatMoney(item.priceCents)}</b>}
                  <StatusBadge appointment={item} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="Ainda sem atendimentos">
            <p>Depois da sua primeira visita, ela fica registrada aqui.</p>
            <Link className="ca-link" href="/cliente/agendar">
              Agendar um horário
            </Link>
          </Empty>
        ))}

      {tab === 'payments' &&
        (payments.length ? (
          <ul className="ca-list">
            {payments.map((item) => {
              const Icon = methodIcon[item.method]
              return (
                <li key={item.id}>
                  <span className="ca-list-icon">
                    <Icon size={18} aria-hidden />
                  </span>
                  <span className="ca-list-text">
                    <strong>{item.label}</strong>
                    <small>
                      {methodLabel[item.method]} · {new Date(item.at).toLocaleDateString('pt-BR')}
                    </small>
                  </span>
                  <span className="ca-list-end">
                    <b>{formatMoney(item.amountCents)}</b>
                    <span className="ca-badge" data-status={item.status}>
                      {paymentLabel[item.status]}
                    </span>
                    {item.receipt && item.appointmentId ? (
                      <button
                        type="button"
                        className="ca-receipt"
                        disabled={opening === item.id}
                        onClick={() => void openReceipt(item.appointmentId!, item.id)}
                      >
                        <ReceiptText size={14} aria-hidden />
                        {opening === item.id ? 'Abrindo…' : 'Comprovante'}
                      </button>
                    ) : null}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          <Empty title="Nenhum pagamento registrado" />
        ))}
    </div>
  )
}
