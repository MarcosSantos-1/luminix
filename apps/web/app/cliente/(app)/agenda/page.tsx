'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BellRing, CalendarDays, Check, ChevronLeft, ChevronRight, Plus, Rows3 } from 'lucide-react'
import {
  cancelAppointment,
  confirmPresence,
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
  // Arriving from a visit or a day elsewhere (?horario= or ?dia=): that day opens and the visit
  // shines for a moment above the others.
  const [focus, setFocus] = useState<string | null>(null)
  const [pulse, setPulse] = useState(0)
  function goTo(day: string, appointmentId?: string) {
    const date = new Date(`${day}T12:00:00`)
    setSelected(day)
    setCursor(new Date(date.getFullYear(), date.getMonth(), date.getDate()))
    setFocus(appointmentId ?? null)
    setPulse((value) => value + 1)
  }

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

  const pendingLink = useRef(true)
  useEffect(() => {
    if (!pendingLink.current || !space?.loaded) return
    pendingLink.current = false
    const search = new URLSearchParams(window.location.search)
    const id = search.get('horario')
    const day = search.get('dia')
    const found = id ? space.appointments.find((item) => item.id === id) : null
    if (!found && !(day && /^d{4}-d{2}-d{2}$/.test(day))) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the URL after the data arrives
    goTo(found ? found.start.slice(0, 10) : day!, found?.id)
    requestAnimationFrame(() =>
      document
        .querySelector(found ? `[data-visit="${found.id}"]` : '.ca-calendar')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    )
  }, [space])
  useEffect(() => {
    if (!focus) return
    const timer = setTimeout(() => setFocus(null), 2600)
    return () => clearTimeout(timer)
  }, [focus, pulse])

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
  // Visits the space booked that wait for the client's "vou, sim" (ADR-043).
  const toConfirm = appointments.filter(
    (item) =>
      !item.presenceConfirmed &&
      ['confirmed', 'requested'].includes(displayStatus(item)) &&
      new Date(`${item.start}:00-03:00`).getTime() > today.getTime(),
  )
  async function confirm(item: Appointment) {
    if (!space) return
    setBusy(true)
    const failure = await confirmPresence(space.summary.slug, item.id)
    setBusy(false)
    if (failure) return toast.error('Não foi possível confirmar', failure)
    toast.success('Presença confirmada', `${item.serviceName} · ${dateLabel(item.start)}`)
    if (open?.id === item.id) setOpen(null)
  }

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

      {toConfirm.length > 0 && (
        <section className="ca-confirm-banner" aria-label="Horários para confirmar">
          <span className="ca-confirm-banner-icon" aria-hidden>
            <BellRing size={20} />
          </span>
          <div>
            <strong>
              {toConfirm.length === 1
                ? 'O espaço marcou um horário para você'
                : `O espaço marcou ${toConfirm.length} horários para você`}
            </strong>
            <small>Confirme se você vai, para o espaço se organizar.</small>
          </div>
          <button
            type="button"
            className="ca-chip-button"
            onClick={() => goTo(toConfirm[0].start.slice(0, 10), toConfirm[0].id)}
          >
            Ver
          </button>
        </section>
      )}

      <section className="ca-calendar" key={`cal-${pulse}`} data-pulse={pulse || undefined}>
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
              data-visit={item.id}
              data-focus={focus === item.id || undefined}
              data-pending={!item.presenceConfirmed || undefined}
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
                <span className="ca-event-tags">
                  <StatusBadge appointment={item} />
                  {!item.presenceConfirmed && toConfirm.includes(item) ? (
                    <span className="ca-badge" data-status="pending">
                      Confirme sua presença
                    </span>
                  ) : null}
                </span>
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
              <li key={item.id} data-visit={item.id} data-focus={focus === item.id || undefined}>
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
            {toConfirm.includes(open) ? (
              <div className="ca-presence">
                <p>
                  <strong>O espaço marcou este horário para você.</strong> Confirme se você vai.
                </p>
                <button
                  type="button"
                  className="ca-button"
                  disabled={busy}
                  onClick={() => void confirm(open)}
                >
                  <Check size={18} aria-hidden /> Vou, sim
                </button>
              </div>
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
