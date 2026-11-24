'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Rows3 } from 'lucide-react'
import {
  cancelAppointment,
  refreshSpace,
  resumePayment,
  useClient,
} from '../../../../lib/client-app/store'
import { DepositPix } from '../../../../components/client-app/deposit-pix'
import { toast } from '../../../../components/client-app/toast'
import {
  addDays,
  dateLabel,
  dayKey,
  durationLabel,
  formatMoney,
  timeLabel,
} from '../../../../lib/client-app/format'
import type { Appointment } from '../../../../lib/client-app/types'
import {
  Lines,
  PageHeader,
  Sheet,
  StatusBadge,
  displayStatus,
} from '../../../../components/client-app/ui'

const weekdays = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

export default function AgendaPage() {
  const { space } = useClient()
  const today = useMemo(() => new Date(), [])
  const [selected, setSelected] = useState(() => dayKey(today))
  const [view, setView] = useState<'week' | 'month'>('week')
  const [cursor, setCursor] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), today.getDate()),
  )
  const [open, setOpenState] = useState<Appointment | null>(null)
  const [busy, setBusy] = useState(false)
  const setOpen = (value: Appointment | null) => setOpenState(value)

  // Back from the Stripe page (ADR-040): say what happens next and fetch the confirmation.
  const slug = space?.summary.slug
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('pagamento')
    if (value !== 'ok' && value !== 'cancelado') return
    window.history.replaceState(null, '', window.location.pathname)
    if (value === 'ok')
      toast.success(
        'Pagamento enviado',
        'Assim que a confirmação chegar, o horário aparece como confirmado.',
      )
    else
      toast.info(
        'Pagamento não concluído',
        'Você pode tentar de novo enquanto o horário estiver guardado.',
      )
    // The webhook usually lands within seconds; look again a couple of times.
    const timers = slug
      ? [3_000, 9_000].map((delay) => setTimeout(() => void refreshSpace(slug), delay))
      : []
    return () => timers.forEach(clearTimeout)
  }, [slug])

  const appointments = useMemo(
    () => [...(space?.appointments ?? [])].sort((a, b) => a.start.localeCompare(b.start)),
    [space],
  )
  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>()
    for (const item of appointments)
      if (displayStatus(item) !== 'cancelled')
        map.set(item.start.slice(0, 10), [...(map.get(item.start.slice(0, 10)) ?? []), item])
    return map
  }, [appointments])

  if (!space) return null

  const days =
    view === 'week'
      ? Array.from({ length: 7 }, (_, index) => addDays(addDays(cursor, -cursor.getDay()), index))
      : (() => {
          const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
          const start = addDays(first, -first.getDay())
          const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
          const total = Math.ceil((first.getDay() + last.getDate()) / 7) * 7
          return Array.from({ length: total }, (_, index) => addDays(start, index))
        })()
  const move = (direction: 1 | -1) =>
    setCursor(
      view === 'week'
        ? addDays(cursor, direction * 7)
        : new Date(cursor.getFullYear(), cursor.getMonth() + direction, 1),
    )
  const dayItems = appointments.filter((item) => item.start.startsWith(selected))
  const upcoming = appointments.filter(
    (item) =>
      ['confirmed', 'requested'].includes(displayStatus(item)) && !item.start.startsWith(selected),
  )
  const canChange = open && ['confirmed', 'requested'].includes(displayStatus(open))

  return (
    <div className="ca-page ca-agenda">
      <PageHeader
        title={selected === dayKey(today) ? 'Hoje' : dateLabel(selected, 'short')}
        kicker={dateLabel(selected)}
        action={
          <Link
            className="ca-icon-button solid"
            href="/cliente/agendar"
            aria-label="Novo agendamento"
          >
            <Plus size={19} aria-hidden />
          </Link>
        }
      />

      <section className="ca-calendar">
        <header>
          <button
            type="button"
            className="ca-icon-button"
            aria-label="Anterior"
            onClick={() => move(-1)}
          >
            <ChevronLeft size={18} aria-hidden />
          </button>
          <strong>{cursor.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</strong>
          <button
            type="button"
            className="ca-icon-button"
            aria-label="Próximo"
            onClick={() => move(1)}
          >
            <ChevronRight size={18} aria-hidden />
          </button>
          <button
            type="button"
            className="ca-icon-button"
            aria-label={view === 'week' ? 'Ver mês inteiro' : 'Ver só a semana'}
            onClick={() => setView(view === 'week' ? 'month' : 'week')}
          >
            {view === 'week' ? (
              <CalendarDays size={18} aria-hidden />
            ) : (
              <Rows3 size={18} aria-hidden />
            )}
          </button>
        </header>
        <div className="ca-cal-grid" data-view={view}>
          {weekdays.map((label) => (
            <span key={label} className="ca-cal-head">
              {label}
            </span>
          ))}
          {days.map((date) => {
            const key = dayKey(date)
            return (
              <button
                key={key}
                type="button"
                aria-pressed={key === selected}
                data-today={key === dayKey(today) || undefined}
                data-out={(view === 'month' && date.getMonth() !== cursor.getMonth()) || undefined}
                aria-label={`${dateLabel(key)}${byDay.has(key) ? ', com horário marcado' : ''}`}
                onClick={() => setSelected(key)}
              >
                {date.getDate()}
                {byDay.has(key) && <i />}
              </button>
            )
          })}
        </div>
      </section>

      <section className="ca-timeline">
        {dayItems.length ? (
          dayItems.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className="ca-event"
              data-tone={index === 0 && displayStatus(item) !== 'cancelled' ? 'dark' : 'light'}
              onClick={() => setOpen(item)}
            >
              <span className="ca-event-dot" aria-hidden />
              <span className="ca-event-card">
                {index === 0 && <Lines />}
                <span className="ca-event-head">
                  <strong>{item.serviceName}</strong>
                  <time>{timeLabel(item.start)}</time>
                </span>
                <small>
                  {item.category} · {durationLabel(item.durationMinutes)}
                </small>
                <StatusBadge appointment={item} />
              </span>
            </button>
          ))
        ) : (
          <p className="ca-muted">Nada marcado neste dia.</p>
        )}
      </section>

      <section className="ca-section">
        <header>
          <h2>Próximos</h2>
          <Link href="/cliente/historico">Histórico</Link>
        </header>
        {upcoming.length ? (
          <ul className="ca-list">
            {upcoming.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => setOpen(item)}>
                  <span className="ca-date-tile">
                    <b>{item.start.slice(8, 10)}</b>
                    {new Date(item.start)
                      .toLocaleDateString('pt-BR', { month: 'short' })
                      .replace('.', '')}
                  </span>
                  <span className="ca-list-text">
                    <strong>{item.serviceName}</strong>
                    <small>
                      {timeLabel(item.start)} · {durationLabel(item.durationMinutes)}
                      {item.deposit?.status === 'awaiting' ? ' · falta o sinal' : ''}
                      {item.deposit?.status === 'reported' ? ' · sinal em conferência' : ''}
                      {item.onlinePayment?.status === 'awaiting' && item.onlinePayment.dueAt
                        ? ` · pague até ${new Date(item.onlinePayment.dueAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                        : ''}
                      {item.onlinePayment?.status === 'paid'
                        ? item.onlinePayment.kind === 'deposit'
                          ? ' · sinal pago'
                          : ' · pago pelo app'
                        : ''}
                      {item.onlinePayment?.status === 'refunded' ? ' · valor devolvido' : ''}
                    </small>
                  </span>
                  <StatusBadge appointment={item} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ca-muted">Sem outros horários marcados.</p>
        )}
      </section>

      {open && (
        <Sheet title={open.serviceName} onClose={() => setOpen(null)}>
          <div className="ca-detail">
            <StatusBadge appointment={open} />
            <dl>
              <div>
                <dt>Quando</dt>
                <dd>
                  {dateLabel(open.start)} às {timeLabel(open.start)}
                </dd>
              </div>
              <div>
                <dt>Duração</dt>
                <dd>{durationLabel(open.durationMinutes)}</dd>
              </div>
              <div>
                <dt>Onde</dt>
                <dd>{space.summary.name}</dd>
              </div>
              {open.professionalName && (
                <div>
                  <dt>Com</dt>
                  <dd>{open.professionalName}</dd>
                </div>
              )}
            </dl>
            {open.deposit ? (
              <DepositPix
                slug={space.summary.slug}
                appointmentId={open.id}
                deposit={
                  space.appointments.find((item) => item.id === open.id)?.deposit ?? open.deposit
                }
              />
            ) : null}
            {open.onlinePayment?.status === 'awaiting' ? (
              <div className="ca-pay-due">
                <p>
                  Falta pagar para garantir o horário
                  {open.onlinePayment.dueAt
                    ? ` (até ${new Date(open.onlinePayment.dueAt).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })})`
                    : ''}
                  .
                </p>
                <button
                  type="button"
                  className="ca-button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    const result = await resumePayment(space.summary.slug, open.id)
                    if (result.url) return window.location.assign(result.url)
                    setBusy(false)
                    if (result.error)
                      toast.error('Não foi possível abrir o pagamento', result.error)
                  }}
                >
                  Pagar agora
                </button>
              </div>
            ) : null}
            {open.onlinePayment?.status === 'paid' ? (
              <p className="ca-pay-done">
                {open.onlinePayment.kind === 'deposit'
                  ? `Sinal de ${formatMoney(open.onlinePayment.amountCents ?? 0)} pago pelo app ✓`
                  : 'Pago pelo app ✓'}
                {open.onlinePayment.kind === 'deposit' && open.priceCents > open.paidCents ? (
                  <small>
                    {' '}
                    Falta {formatMoney(open.priceCents - open.paidCents)}, pago no espaço no dia.
                  </small>
                ) : null}
                {canChange ? (
                  <small> Se cancelar dentro do prazo, o valor pago volta para você.</small>
                ) : null}
              </p>
            ) : null}
            {open.onlinePayment?.status === 'refunded' ? (
              <p className="ca-pay-done">
                Valor devolvido ✓<small> No Pix volta na hora; no cartão, em alguns dias.</small>
              </p>
            ) : null}
            {space.policy?.instructions && <p>{space.policy.instructions}</p>}
          </div>
          {canChange ? (
            <>
              <Link className="ca-button" href={`/cliente/agendar?remarcar=${open.id}`}>
                Remarcar
              </Link>
              <button
                type="button"
                className="ca-button danger"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  const failure = await cancelAppointment(space.summary.slug, open.id)
                  setBusy(false)
                  if (failure) return toast.error('Não foi possível cancelar', failure)
                  toast.success('Horário cancelado', open.serviceName)
                  setOpen(null)
                }}
              >
                Cancelar horário
              </button>
            </>
          ) : (
            <Link className="ca-button" href={`/cliente/agendar?servico=${open.serviceId}`}>
              Agendar de novo
            </Link>
          )}
        </Sheet>
      )}
    </div>
  )
}
