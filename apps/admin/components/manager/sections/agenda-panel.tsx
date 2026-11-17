'use client'

import { Button, Card } from '@heroui/react'
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Plus,
  RotateCcw,
  Settings2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppointmentSheet } from '../appointments/appointment-sheet'
import { BookingModal } from '../appointments/booking-modal'
import {
  clock,
  dayLabel,
  localDate,
  needsAttention,
  type AppointmentView,
} from '../appointments/model'
import {
  ScheduleModal,
  type OverrideRow,
  type ProfessionalDayRow,
  type WeeklyRow,
} from '../appointments/schedule-modal'
import { appointmentStatus } from '../business/format'
import { useClinicApi } from '../settings/clinic-api'
import '../appointments/appointments.css'

type Row = {
  id: string
  starts_at: string
  ends_at: string
  previous_starts_at: string | null
  status: string
  override_reasons: string[]
  notes: string | null
  price_cents: number | null
  paid: boolean
  client_id: string
  client_name: string
  client_phone: string | null
  client_notes: string | null
  client_photo_url?: string | null
  client_photo_large_url?: string | null
  account_photo?: boolean
  price_type?: string
  service_name: string
  professional_name: string | null
}
type AgendaData = {
  appointments: Row[]
  clients: { id: string; display_name: string }[]
  services: { id: string; name: string; duration_minutes: number }[]
  professionals: { id: string; display_name: string }[]
  weeklyAvailability: WeeklyRow[]
  overrides: OverrideRow[]
  professionalAvailability?: ProfessionalDayRow[]
  timezone: string
  canManage?: boolean
  canManageHours?: boolean
  canManageTeam?: boolean
  canCharge?: boolean
  canOpenClients?: boolean
}

function startOfMonday(value: Date) {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  const weekday = date.getDay()
  date.setDate(date.getDate() + (weekday === 0 ? -6 : 1 - weekday))
  return date
}
function addDays(value: Date, amount: number) {
  const next = new Date(value)
  next.setDate(next.getDate() + amount)
  return next
}
function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1)
}
function addMonths(value: Date, amount: number) {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1)
}
function ymd(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

function toView(row: Row): AppointmentView {
  return {
    id: row.id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    previousStartsAt: row.previous_starts_at,
    status: row.status,
    clientId: row.client_id,
    client: row.client_name,
    phone: row.client_phone,
    clientNotes: row.client_notes,
    notes: row.notes,
    warnings: row.override_reasons ?? [],
    service: row.service_name,
    professional: row.professional_name,
    priceCents: row.price_cents == null ? null : Number(row.price_cents),
    priceType: row.price_type,
    paid: row.paid === true,
    photoUrl: row.client_photo_url,
    photoLargeUrl: row.client_photo_large_url,
    accountPhoto: row.account_photo === true,
  }
}

/** One appointment in a day: tap to open its sheet. */
function AppointmentCard({
  item,
  timezone,
  ghost,
  onOpen,
}: {
  item: AppointmentView
  timezone: string
  /** Shown on the day it left ("remarcado para…"). */
  ghost?: boolean
  onOpen: (item: AppointmentView) => void
}) {
  const status = appointmentStatus[item.status] ?? appointmentStatus.confirmed
  return (
    <button
      type="button"
      className={`ag-card is-${ghost ? 'moved' : item.status}`}
      onClick={() => onOpen(item)}
      aria-label={`${item.client}, ${item.service}, ${clock(item.startsAt, timezone)}, ${ghost ? 'remarcado' : status.label}`}
    >
      <span className="ag-card-top">
        <time>
          {ghost && item.previousStartsAt
            ? clock(item.previousStartsAt, timezone)
            : clock(item.startsAt, timezone)}
        </time>
        <span className="ag-card-flags">
          {needsAttention(item) ? (
            <AlertTriangle size={14} className="is-attention" aria-label="Tem observações" />
          ) : null}
          {item.paid ? <CircleDollarSign size={14} className="is-paid" aria-label="Pago" /> : null}
          {item.status === 'completed' ? <Check size={14} className="is-paid" aria-hidden /> : null}
          {item.previousStartsAt && !ghost ? <RotateCcw size={13} aria-label="Remarcado" /> : null}
        </span>
      </span>
      <strong>{item.client}</strong>
      <span>{item.service}</span>
      {item.professional ? <small>{item.professional}</small> : null}
      {ghost ? (
        <small className="ag-card-note">
          Remarcado para {dayLabel(item.startsAt, timezone)}, {clock(item.startsAt, timezone)}
        </small>
      ) : item.status !== 'confirmed' ? (
        <small className="ag-card-note">{status.label}</small>
      ) : null}
    </button>
  )
}

export function AgendaPanel({
  clinicId,
  createSignal = 0,
  embedded = false,
  onOpenClient,
}: {
  clinicId: string
  createSignal?: number
  /** Inside a pop-up (Início): no outer spacing and no month view. */
  embedded?: boolean
  onOpenClient?: (client: { id: string; name: string }) => void
}) {
  const api = useClinicApi(clinicId)
  const [week, setWeek] = useState(() => startOfMonday(new Date()))
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [view, setView] = useState<'week' | 'month'>('week')
  const [selectedDate, setSelectedDate] = useState(() => ymd(new Date()))
  const [data, setData] = useState<AgendaData | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [booking, setBooking] = useState<{ open: boolean; date?: string }>({ open: false })
  const [schedule, setSchedule] = useState<{ open: boolean; date?: string | null }>({ open: false })
  const [opened, setOpened] = useState<AppointmentView | null>(null)
  const [reload, setReload] = useState(0)
  const selectedDayRef = useRef<HTMLDivElement>(null)

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(week, index)), [week])
  const monthDays = useMemo(() => {
    const firstGridDay = startOfMonday(startOfMonth(month))
    return Array.from({ length: 42 }, (_, index) => addDays(firstGridDay, index))
  }, [month])
  const range = useMemo(() => {
    const from = view === 'week' ? addDays(week, -1) : addDays(monthDays[0], -1)
    const to = view === 'week' ? addDays(week, 8) : addDays(monthDays[41], 1)
    return {
      from: new Date(`${ymd(from)}T00:00:00.000Z`).toISOString(),
      to: new Date(`${ymd(to)}T23:59:59.999Z`).toISOString(),
    }
  }, [monthDays, view, week])

  useEffect(() => {
    if (!api.ready) return
    let active = true
    void api
      .get<AgendaData>('agenda', range)
      .then((body) => {
        if (!active) return
        setData(body)
        setError('')
      })
      .catch(() => active && setError('Não foi possível carregar a agenda.'))
    return () => {
      active = false
    }
  }, [api, range, reload])

  useEffect(() => {
    if (!createSignal) return
    const timeout = window.setTimeout(() => setBooking({ open: true }), 0)
    return () => window.clearTimeout(timeout)
  }, [createSignal])

  const changed = useCallback((message: string) => {
    setNotice(message)
    setReload((value) => value + 1)
  }, [])

  const timezone = data?.timezone ?? 'America/Sao_Paulo'
  const today = localDate(new Date(), timezone)
  const views = useMemo(() => (data?.appointments ?? []).map(toView), [data])

  /** What happens on a day: who comes, and what left it (canceled or moved away). */
  function dayItems(date: string) {
    const here = views.filter((item) => localDate(item.startsAt, timezone) === date)
    return {
      active: here.filter((item) => item.status !== 'canceled'),
      canceled: here.filter((item) => item.status === 'canceled'),
      moved: views.filter(
        (item) =>
          item.previousStartsAt &&
          localDate(item.previousStartsAt, timezone) === date &&
          localDate(item.startsAt, timezone) !== date,
      ),
    }
  }
  function dayRule(date: string, weekday: number) {
    const exception = data?.overrides.find((item) => item.local_date.slice(0, 10) === date)
    const open = exception
      ? exception.is_available
      : (data?.weeklyAvailability.find((item) => Number(item.weekday) === weekday)?.is_available ??
        false)
    return { exception, open }
  }

  function selectMonthDay(day: Date) {
    setSelectedDate(ymd(day))
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth'
    window.requestAnimationFrame(() =>
      selectedDayRef.current?.scrollIntoView({ behavior, block: 'start' }),
    )
  }
  function movePeriod(amount: number) {
    if (view === 'week') return setWeek((current) => addDays(current, amount * 7))
    const next = addMonths(month, amount)
    setMonth(next)
    setSelectedDate(ymd(next))
  }
  function changeView(nextView: 'week' | 'month') {
    if (nextView === view) return
    if (nextView === 'month') {
      const focus = addDays(week, 3)
      setMonth(startOfMonth(focus))
      setSelectedDate(ymd(focus))
    } else setWeek(startOfMonday(new Date(`${selectedDate}T12:00:00`)))
    setView(nextView)
  }
  function goToToday() {
    const now = new Date()
    setWeek(startOfMonday(now))
    setMonth(startOfMonth(now))
    setSelectedDate(ymd(now))
  }

  const weekDays = days.map((day) => {
    const date = ymd(day)
    return { day, date, ...dayItems(date), ...dayRule(date, day.getDay()) }
  })
  // Days the space does not open (and nothing happens on) are left out to give room to the rest.
  const shownDays = weekDays.filter(
    (item) =>
      item.open ||
      item.active.length ||
      item.canceled.length ||
      item.moved.length ||
      item.date === today,
  )
  const hiddenDays = weekDays.filter((item) => !shownDays.includes(item))
  const selected = dayItems(selectedDate)
  const selectedDay = new Date(`${selectedDate}T12:00:00`)
  const canManage = data?.canManage !== false

  return (
    <div className={`manager-section manager-data-section ag${embedded ? ' is-embedded' : ''}`}>
      <div className="manager-section-toolbar manager-agenda-toolbar">
        <div className="manager-week-nav">
          <Button
            isIconOnly
            variant="secondary"
            aria-label={view === 'week' ? 'Semana anterior' : 'Mês anterior'}
            onPress={() => movePeriod(-1)}
          >
            <ChevronLeft size={18} />
          </Button>
          <strong>
            {view === 'week' ? (
              <>
                {new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(
                  days[0],
                )}
                {' — '}
                {new Intl.DateTimeFormat('pt-BR', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                }).format(days[6])}
              </>
            ) : (
              new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(month)
            )}
          </strong>
          <Button
            isIconOnly
            variant="secondary"
            aria-label={view === 'week' ? 'Próxima semana' : 'Próximo mês'}
            onPress={() => movePeriod(1)}
          >
            <ChevronRight size={18} />
          </Button>
          <Button variant="ghost" onPress={goToToday}>
            Hoje
          </Button>
        </div>
        <div className="manager-toolbar-actions">
          {embedded ? null : (
            <div className="manager-view-switch" aria-label="Visualização da agenda">
              <Button
                variant={view === 'week' ? undefined : 'secondary'}
                aria-pressed={view === 'week'}
                onPress={() => changeView('week')}
              >
                Semana
              </Button>
              <Button
                variant={view === 'month' ? undefined : 'secondary'}
                aria-pressed={view === 'month'}
                onPress={() => changeView('month')}
              >
                Mês
              </Button>
            </div>
          )}
          <Button
            variant="secondary"
            data-manager-spotlight="schedule"
            isDisabled={!data}
            onPress={() => setSchedule({ open: true })}
          >
            <Settings2 size={17} /> Horários
          </Button>
          {canManage ? (
            <Button onPress={() => setBooking({ open: true })}>
              <Plus size={18} /> Novo agendamento
            </Button>
          ) : null}
        </div>
      </div>
      {error && (
        <p className="manager-data-error" role="alert">
          {error}
        </p>
      )}
      {notice ? (
        <p className="apt-done" role="status">
          <Check size={16} aria-hidden /> {notice}
        </p>
      ) : null}
      {!data ? (
        error ? null : (
          <div className="manager-agenda-skeleton" role="status" aria-label="Carregando agenda">
            <div className="manager-skeleton manager-skeleton-heading" />
            <div className="manager-skeleton-calendar">
              {Array.from({ length: 14 }, (_, index) => (
                <div className="manager-skeleton manager-skeleton-day" key={index} />
              ))}
            </div>
            <span>Carregando agenda…</span>
          </div>
        )
      ) : view === 'month' ? (
        <>
          <Card className="manager-panel manager-month-card">
            <Card.Content>
              <div className="manager-month-weekdays" aria-hidden="true">
                {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
              <div className="manager-month-grid" role="grid" aria-label="Calendário mensal">
                {monthDays.map((day) => {
                  const date = ymd(day)
                  const count = dayItems(date).active.length
                  const rule = dayRule(date, day.getDay())
                  const isSelected = date === selectedDate
                  return (
                    <button
                      type="button"
                      role="gridcell"
                      className="manager-month-day"
                      data-outside={day.getMonth() !== month.getMonth() || undefined}
                      data-today={date === today || undefined}
                      data-selected={isSelected || undefined}
                      data-closed={!rule.open || undefined}
                      aria-selected={isSelected}
                      aria-label={`${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(day)}, ${count} ${count === 1 ? 'agendamento' : 'agendamentos'}${rule.open ? '' : ', fechado'}`}
                      key={date}
                      onClick={() => selectMonthDay(day)}
                    >
                      <span className="manager-month-day-number">
                        {day.getDate()}
                        {rule.exception && <i title="Data especial" />}
                      </span>
                      <strong>{count || (rule.open ? 0 : '—')}</strong>
                      <small>
                        {count || rule.open
                          ? count === 1
                            ? 'agendamento'
                            : 'agendamentos'
                          : 'fechado'}
                      </small>
                    </button>
                  )
                })}
              </div>
            </Card.Content>
          </Card>
          <div ref={selectedDayRef} className="manager-selected-day">
            <Card className="manager-panel">
              <Card.Header className="manager-panel-heading">
                <div>
                  <CalendarClock size={18} />
                  <Card.Title>
                    {new Intl.DateTimeFormat('pt-BR', {
                      weekday: 'long',
                      day: '2-digit',
                      month: 'long',
                    }).format(selectedDay)}
                  </Card.Title>
                </div>
                {canManage ? (
                  <Button
                    variant="secondary"
                    onPress={() => setBooking({ open: true, date: selectedDate })}
                  >
                    <Plus size={17} /> Agendar neste dia
                  </Button>
                ) : null}
              </Card.Header>
              <Card.Content>
                {selected.active.length ? (
                  <div className="ag-list is-wide">
                    {selected.active.map((item) => (
                      <AppointmentCard
                        key={item.id}
                        item={item}
                        timezone={timezone}
                        onOpen={setOpened}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="manager-empty-real manager-selected-empty">
                    <CalendarClock size={25} />
                    <strong>Nenhum agendamento neste dia</strong>
                    <p>O dia está livre na agenda atual.</p>
                  </div>
                )}
                <Removed
                  canceled={selected.canceled}
                  moved={selected.moved}
                  timezone={timezone}
                  onOpen={setOpened}
                />
              </Card.Content>
            </Card>
          </div>
        </>
      ) : (
        <>
          <div className="ag-week" style={{ ['--ag-days' as string]: shownDays.length }}>
            {shownDays.map((item) => (
              <section
                className="ag-day"
                key={item.date}
                data-today={item.date === today || undefined}
                data-past={item.date < today || undefined}
                data-closed={!item.open || undefined}
                aria-label={new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(
                  item.day,
                )}
              >
                <header className="ag-day-head">
                  <div>
                    <span>
                      {new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(item.day)}
                    </span>
                    <strong>{item.day.getDate()}</strong>
                  </div>
                  <div className="ag-day-tags">
                    {item.date === today ? <em>Hoje</em> : null}
                    {item.exception || !item.open ? (
                      <button
                        type="button"
                        className="ag-day-rule"
                        title="Ajustar o horário deste dia"
                        onClick={() => setSchedule({ open: true, date: item.date })}
                      >
                        {item.exception
                          ? item.open
                            ? `Especial ${item.exception.periods[0]?.start ?? ''}`
                            : item.exception.reason || 'Fechado'
                          : 'Fechado'}
                      </button>
                    ) : null}
                    {canManage ? (
                      <button
                        type="button"
                        className="ag-day-add"
                        aria-label={`Agendar em ${dayLabel(`${item.date}T12:00:00`)}`}
                        onClick={() => setBooking({ open: true, date: item.date })}
                      >
                        <Plus size={16} />
                      </button>
                    ) : null}
                  </div>
                </header>
                {item.active.length ? (
                  <div className="ag-list">
                    {item.active.map((entry) => (
                      <AppointmentCard
                        key={entry.id}
                        item={entry}
                        timezone={timezone}
                        onOpen={setOpened}
                      />
                    ))}
                  </div>
                ) : canManage ? (
                  <button
                    className="ag-empty"
                    type="button"
                    onClick={() => setBooking({ open: true, date: item.date })}
                  >
                    <Plus size={16} /> Agendar
                  </button>
                ) : (
                  <p className="ag-empty">Livre</p>
                )}
                <Removed
                  canceled={item.canceled}
                  moved={item.moved}
                  timezone={timezone}
                  onOpen={setOpened}
                />
              </section>
            ))}
          </div>
          {hiddenDays.length ? (
            <p className="ag-hidden-days">
              Sem atendimento nesta semana:{' '}
              {hiddenDays
                .map((item) =>
                  new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(item.day),
                )
                .join(', ')}
              .{' '}
              <button type="button" onClick={() => setSchedule({ open: true })}>
                Ajustar horários
              </button>
            </p>
          ) : null}
        </>
      )}

      <BookingModal
        api={api}
        isOpen={booking.open}
        onOpenChange={(open) => setBooking((current) => ({ ...current, open }))}
        options={data}
        initialDate={booking.date}
        onCreated={changed}
      />
      {data ? (
        <ScheduleModal
          api={api}
          isOpen={schedule.open}
          onOpenChange={(open) => setSchedule((current) => ({ ...current, open }))}
          weekly={data.weeklyAvailability}
          overrides={data.overrides}
          professionals={data.professionals}
          professionalAvailability={data.professionalAvailability ?? []}
          canManageHours={data.canManageHours !== false}
          canManageTeam={data.canManageTeam !== false}
          initialDate={schedule.date}
          onSaved={changed}
        />
      ) : null}
      <AppointmentSheet
        api={api}
        item={opened}
        today={today}
        access={{
          manage: canManage,
          charge: data?.canCharge !== false,
          openClients: data?.canOpenClients !== false,
        }}
        onClose={() => setOpened(null)}
        onChanged={changed}
        onOpenClient={onOpenClient}
      />
    </div>
  )
}

/** Canceled and rescheduled-away appointments, folded so they do not crowd the day. */
function Removed({
  canceled,
  moved,
  timezone,
  onOpen,
}: {
  canceled: AppointmentView[]
  moved: AppointmentView[]
  timezone: string
  onOpen: (item: AppointmentView) => void
}) {
  if (!canceled.length && !moved.length) return null
  const label = [
    canceled.length
      ? `${canceled.length} ${canceled.length === 1 ? 'cancelado' : 'cancelados'}`
      : '',
    moved.length ? `${moved.length} ${moved.length === 1 ? 'remarcado' : 'remarcados'}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <details className="ag-removed">
      <summary>
        {label} <ChevronDown size={14} aria-hidden />
      </summary>
      <div className="ag-list">
        {canceled.map((item) => (
          <AppointmentCard key={item.id} item={item} timezone={timezone} onOpen={onOpen} />
        ))}
        {moved.map((item) => (
          <AppointmentCard
            key={`moved-${item.id}`}
            item={item}
            timezone={timezone}
            ghost
            onOpen={onOpen}
          />
        ))}
      </div>
    </details>
  )
}
