'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  CalendarCheck,
  CalendarX,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  QrCode,
  ReceiptText,
  Search,
  Store,
  X,
} from 'lucide-react'
import { paymentReceipt, useClient } from '../../../../lib/client-app/store'
import { toast } from '../../../../components/client-app/toast'
import { dateLabel, formatMoney, timeLabel } from '../../../../lib/client-app/format'
import { Empty, PageHeader, StatusBadge, displayStatus } from '../../../../components/client-app/ui'

const methodIcon = { pix: QrCode, card: CreditCard, local: Store }
const methodLabel = { pix: 'Pix', card: 'Cartão', local: 'No espaço' }
const paymentLabel = { paid: 'Pago', pending: 'A pagar no espaço', refunded: 'Estornado' }

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

const monthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
const monthName = (key: string) =>
  new Date(`${key}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

type VisitFilter = 'all' | 'done' | 'cancelled'
type PayFilter = 'all' | 'paid' | 'pending' | 'refunded'

export default function HistoryPage() {
  const { space } = useClient()
  const today = useMemo(() => new Date(), [])
  const [tab, setTab] = useState<'visits' | 'payments'>('visits')
  const [opening, setOpening] = useState<string | null>(null)
  // Default: the current month. null = the whole period.
  const [month, setMonth] = useState<string | null>(() => monthKey(today))
  const [query, setQuery] = useState('')
  const [visitFilter, setVisitFilter] = useState<VisitFilter>('all')
  const [payFilter, setPayFilter] = useState<PayFilter>('all')

  const visits = useMemo(
    () =>
      (space?.appointments ?? [])
        .filter((item) => ['done', 'cancelled'].includes(displayStatus(item)))
        .sort((a, b) => b.start.localeCompare(a.start)),
    [space],
  )
  const payments = useMemo(() => {
    const startOf = new Map((space?.appointments ?? []).map((item) => [item.id, item.start]))
    return [...(space?.payments ?? [])]
      .map((item) => ({
        ...item,
        // A payment belongs to the month of its visit.
        when: (item.appointmentId && startOf.get(item.appointmentId)) || item.at,
      }))
      .sort((a, b) => b.when.localeCompare(a.when))
  }, [space])

  if (!space) return null

  const term = fold(query.trim())
  const inMonth = (iso: string) => !month || iso.startsWith(month)
  const shownVisits = visits.filter(
    (item) =>
      inMonth(item.start) &&
      (visitFilter === 'all' || displayStatus(item) === visitFilter) &&
      (!term || fold(`${item.serviceName} ${item.professionalName ?? ''}`).includes(term)),
  )
  const shownPayments = payments.filter(
    (item) =>
      inMonth(item.when) &&
      (payFilter === 'all' || item.status === payFilter) &&
      (!term || fold(item.label).includes(term)),
  )
  const monthVisits = visits.filter((item) => inMonth(item.start))
  const done = monthVisits.filter((item) => displayStatus(item) === 'done')
  const spent = payments
    .filter((item) => item.status === 'paid' && inMonth(item.when))
    .reduce((sum, item) => sum + item.amountCents, 0)
  const lastVisit = visits.find((item) => displayStatus(item) === 'done')

  const stepMonth = (direction: 1 | -1) => {
    const base = month ?? monthKey(today)
    const date = new Date(`${base}-15T12:00:00`)
    date.setMonth(date.getMonth() + direction)
    setMonth(monthKey(date))
  }

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

  return (
    <div className="ca-page ca-history">
      <PageHeader title="Histórico" kicker={space.summary.name} />

      <div className="ca-stats">
        <div>
          <small>{month ? 'Realizados no mês' : 'Atendimentos realizados'}</small>
          <strong>{done.length}</strong>
        </div>
        <div>
          <small>{month ? 'Pago no mês' : 'Total pago'}</small>
          <strong>{formatMoney(spent)}</strong>
        </div>
        <div>
          <small>Última visita</small>
          <strong>{lastVisit ? dateLabel(lastVisit.start, 'short') : '—'}</strong>
        </div>
      </div>

      <div className="ca-history-filters">
        <div className="ca-month" role="group" aria-label="Período">
          <button
            type="button"
            className="ca-month-step"
            aria-label="Mês anterior"
            onClick={() => stepMonth(-1)}
          >
            <ChevronLeft size={18} aria-hidden />
          </button>
          <button
            type="button"
            className="ca-month-label"
            aria-pressed={!month}
            onClick={() => setMonth(month ? null : monthKey(today))}
            title={month ? 'Ver todo o período' : 'Voltar ao mês atual'}
          >
            {month ? monthName(month) : 'Todo o período'}
          </button>
          <button
            type="button"
            className="ca-month-step"
            aria-label="Próximo mês"
            disabled={!!month && month >= monthKey(today)}
            onClick={() => stepMonth(1)}
          >
            <ChevronRight size={18} aria-hidden />
          </button>
        </div>
        <label className="ca-search ca-search-soft">
          <Search size={18} aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tab === 'visits' ? 'Buscar atendimento' : 'Buscar pagamento'}
            aria-label="Buscar no histórico"
          />
          {query && (
            <button type="button" aria-label="Limpar busca" onClick={() => setQuery('')}>
              <X size={16} aria-hidden />
            </button>
          )}
        </label>
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

      <div className="ca-chips" role="group" aria-label="Situação">
        {tab === 'visits'
          ? (
              [
                ['all', 'Todos'],
                ['done', 'Realizados'],
                ['cancelled', 'Cancelados'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                data-tone={value}
                aria-pressed={visitFilter === value}
                onClick={() => setVisitFilter(value)}
              >
                {label}
              </button>
            ))
          : (
              [
                ['all', 'Todos'],
                ['paid', 'Pagos'],
                ['pending', 'A pagar'],
                ['refunded', 'Estornados'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                data-tone={value}
                aria-pressed={payFilter === value}
                onClick={() => setPayFilter(value)}
              >
                {label}
              </button>
            ))}
      </div>

      {tab === 'visits' &&
        (shownVisits.length ? (
          <ul className="ca-list ca-history-list" key={`v-${month}-${visitFilter}`}>
            {shownVisits.map((item) => {
              const status = displayStatus(item)
              return (
                <li key={item.id} data-status={status}>
                  <Link href={`/cliente/agenda?horario=${item.id}`}>
                    <span className="ca-list-icon">
                      {status === 'cancelled' ? (
                        <CalendarX size={18} aria-hidden />
                      ) : (
                        <CalendarCheck size={18} aria-hidden />
                      )}
                    </span>
                    <span className="ca-list-text">
                      <strong>{item.serviceName}</strong>
                      <small>
                        {dateLabel(item.start)} · {timeLabel(item.start)}
                        {item.professionalName ? ` · ${item.professionalName}` : ''}
                      </small>
                    </span>
                    <span className="ca-list-end">
                      {item.priceCents > 0 && <b>{formatMoney(item.priceCents)}</b>}
                      <StatusBadge appointment={item} />
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <Empty title={month ? `Nada em ${monthName(month)}` : 'Ainda sem atendimentos'}>
            <p>
              {month
                ? 'Veja outro mês ou todo o período.'
                : 'Depois da sua primeira visita, ela fica registrada aqui.'}
            </p>
            {month ? (
              <button type="button" className="ca-link" onClick={() => setMonth(null)}>
                Ver todo o período
              </button>
            ) : (
              <Link className="ca-link" href="/cliente/agendar">
                Agendar um horário
              </Link>
            )}
          </Empty>
        ))}

      {tab === 'payments' &&
        (shownPayments.length ? (
          <ul className="ca-list ca-history-list" key={`p-${month}-${payFilter}`}>
            {shownPayments.map((item) => {
              const Icon = methodIcon[item.method]
              return (
                <li key={item.id} data-status={item.status}>
                  <span className="ca-list-icon">
                    <Icon size={18} aria-hidden />
                  </span>
                  <span className="ca-list-text">
                    <strong>{item.label}</strong>
                    <small>
                      {methodLabel[item.method]} · {dateLabel(item.when, 'short')}
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
          <Empty title={month ? `Nenhum pagamento em ${monthName(month)}` : 'Nenhum pagamento'}>
            {month ? (
              <button type="button" className="ca-link" onClick={() => setMonth(null)}>
                Ver todo o período
              </button>
            ) : null}
          </Empty>
        ))}
    </div>
  )
}
