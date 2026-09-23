'use client'

import { Button, Card, Chip, Modal } from '@heroui/react'
import {
  AlertTriangle,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Plus,
  Settings2,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useClinic } from '@/components/clinic-workspace'
import { useStaff } from '@/components/staff-provider'

type Period = { start: string; end: string }
type Appointment = {
  id: string
  starts_at: string
  ends_at: string
  status: string
  booking_source: string
  override_reasons: string[]
  client_name: string
  service_name: string
  professional_name: string | null
}
type AgendaData = {
  appointments: Appointment[]
  clients: { id: string; display_name: string }[]
  services: { id: string; name: string; duration_minutes: number }[]
  professionals: { id: string; display_name: string }[]
  weeklyAvailability: Array<{ weekday: number; is_available: boolean; periods: Period[] }>
  overrides: Array<{
    local_date: string
    is_available: boolean
    periods: Period[]
    reason: string | null
  }>
  timezone: string
}
type BookingWarning = { code: string; title: string; detail: string }
type DayRule = { weekday: number; isAvailable: boolean; periods: Period[] }

const weekdayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const emptyBooking = {
  clientId: '',
  serviceId: '',
  professionalId: '',
  localStartsAt: '',
  notes: '',
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

function clinicParts(value: string | Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value))
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return {
    date: `${read('year')}-${read('month')}-${read('day')}`,
    time: `${read('hour')}:${read('minute')}`,
  }
}

function freshWeek(): DayRule[] {
  return weekdayNames.map((_, weekday) => ({ weekday, isAvailable: false, periods: [] }))
}

export function AgendaPanel({ createSignal = 0 }: { createSignal?: number }) {
  const { clinic } = useClinic()
  const { user } = useStaff()
  const [week, setWeek] = useState(() => startOfMonday(new Date()))
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [view, setView] = useState<'week' | 'month'>('week')
  const [selectedDate, setSelectedDate] = useState(() => ymd(new Date()))
  const [data, setData] = useState<AgendaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [bookingOpen, setBookingOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduleMode, setScheduleMode] = useState<'weekly' | 'override'>('weekly')
  const [booking, setBooking] = useState(emptyBooking)
  const [warnings, setWarnings] = useState<BookingWarning[]>([])
  const [weekly, setWeekly] = useState<DayRule[]>(freshWeek)
  const [override, setOverride] = useState({
    date: ymd(new Date()),
    kind: 'custom' as 'default' | 'closed' | 'custom',
    start: '09:00',
    end: '18:00',
    reason: '',
  })
  const [saving, setSaving] = useState(false)
  const selectedDayRef = useRef<HTMLDivElement>(null)

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(week, index)), [week])
  const monthDays = useMemo(() => {
    const firstGridDay = startOfMonday(startOfMonth(month))
    return Array.from({ length: 42 }, (_, index) => addDays(firstGridDay, index))
  }, [month])
  const visibleRange = useMemo(
    () =>
      view === 'week'
        ? { from: addDays(week, -1), to: addDays(week, 8) }
        : { from: addDays(monthDays[0], -1), to: addDays(monthDays[41], 1) },
    [monthDays, view, week],
  )

  async function load(signal?: AbortSignal) {
    if (!user) return
    setLoading(true)
    setError('')
    try {
      const from = new Date(`${ymd(visibleRange.from)}T00:00:00.000Z`)
      const to = new Date(`${ymd(visibleRange.to)}T23:59:59.999Z`)
      const query = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })
      const response = await fetch(`/api/clinics/${clinic.id}/agenda?${query}`, {
        headers: { authorization: `Bearer ${await user.getIdToken()}` },
        cache: 'no-store',
        signal,
      })
      if (!response.ok) throw new Error('Unavailable')
      const body: AgendaData = await response.json()
      setData(body)
      const next = freshWeek()
      for (const rule of body.weeklyAvailability) {
        next[rule.weekday] = {
          weekday: rule.weekday,
          isAvailable: rule.is_available,
          periods: rule.periods,
        }
      }
      setWeekly(next)
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === 'AbortError'))
        setError('Não foi possível carregar a agenda desta clínica.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const abort = new AbortController()
    const timeout = window.setTimeout(() => void load(abort.signal), 0)
    return () => {
      window.clearTimeout(timeout)
      abort.abort()
    }
    // load is intentionally scoped to the latest user/clinic/visible range values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinic.id, user, visibleRange])

  useEffect(() => {
    if (!createSignal) return
    const timeout = window.setTimeout(() => {
      setWarnings([])
      setBookingOpen(true)
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [createSignal])

  function appointmentsFor(day: Date) {
    if (!data) return []
    const date = ymd(day)
    return data.appointments.filter(
      (appointment) => clinicParts(appointment.starts_at, data.timezone).date === date,
    )
  }

  function openBooking(day = new Date()) {
    const date = ymd(day)
    setBooking({ ...emptyBooking, localStartsAt: `${date}T09:00` })
    setWarnings([])
    setBookingOpen(true)
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
    if (view === 'week') {
      setWeek((current) => addDays(current, amount * 7))
      return
    }
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
    } else {
      setWeek(startOfMonday(new Date(`${selectedDate}T12:00:00`)))
    }
    setView(nextView)
  }

  function goToToday() {
    const today = new Date()
    setWeek(startOfMonday(today))
    setMonth(startOfMonth(today))
    setSelectedDate(ymd(today))
  }

  async function saveBooking(event?: FormEvent, confirm = false) {
    event?.preventDefault()
    if (!user || saving) return
    setSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/clinics/${clinic.id}/appointments`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${await user.getIdToken()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          ...booking,
          professionalId: booking.professionalId || undefined,
          confirmedWarnings: confirm ? warnings.map((warning) => warning.code) : [],
        }),
      })
      const body = await response.json().catch(() => null)
      if (response.status === 409 && Array.isArray(body?.warnings)) {
        setWarnings(body.warnings)
        return
      }
      if (!response.ok) throw new Error('Não foi possível criar o agendamento.')
      setBookingOpen(false)
      setBooking(emptyBooking)
      setWarnings([])
      setLoading(true)
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível criar o agendamento.')
    } finally {
      setSaving(false)
    }
  }

  function changeDay(dayIndex: number, patch: Partial<DayRule>) {
    setWeekly((current) =>
      current.map((day) => (day.weekday === dayIndex ? { ...day, ...patch } : day)),
    )
  }

  function changePeriod(dayIndex: number, periodIndex: number, patch: Partial<Period>) {
    setWeekly((current) =>
      current.map((day) =>
        day.weekday === dayIndex
          ? {
              ...day,
              periods: day.periods.map((period, index) =>
                index === periodIndex ? { ...period, ...patch } : period,
              ),
            }
          : day,
      ),
    )
  }

  async function saveAvailability() {
    if (!user || saving) return
    setSaving(true)
    setError('')
    try {
      const payload =
        scheduleMode === 'weekly'
          ? {
              mode: 'weekly',
              days: weekly.map((day) => ({
                weekday: day.weekday,
                isAvailable: day.isAvailable,
                periods: day.isAvailable ? day.periods : [],
              })),
            }
          : {
              mode: 'override',
              date: override.date,
              useDefault: override.kind === 'default',
              isAvailable: override.kind === 'custom',
              periods:
                override.kind === 'custom' ? [{ start: override.start, end: override.end }] : [],
              reason: override.reason || undefined,
            }
      const response = await fetch(`/api/clinics/${clinic.id}/availability`, {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${await user.getIdToken()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error('Não foi possível salvar os horários.')
      setScheduleOpen(false)
      setLoading(true)
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível salvar os horários.')
    } finally {
      setSaving(false)
    }
  }

  const selectedDay = new Date(`${selectedDate}T12:00:00`)
  const selectedAppointments = appointmentsFor(selectedDay)
  return (
    <div className="manager-section manager-data-section">
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
          <Button variant="secondary" onPress={() => setScheduleOpen(true)}>
            <Settings2 size={17} /> Horários
          </Button>
          <Button onPress={() => openBooking()}>
            <Plus size={18} /> Novo agendamento
          </Button>
        </div>
      </div>
      {error && (
        <p className="manager-data-error" role="alert">
          {error}
        </p>
      )}
      {loading || !data ? (
        <div className="manager-agenda-skeleton" role="status" aria-label="Carregando agenda">
          <div className="manager-skeleton manager-skeleton-heading" />
          <div className="manager-skeleton-calendar">
            {Array.from({ length: 14 }, (_, index) => (
              <div className="manager-skeleton manager-skeleton-day" key={index} />
            ))}
          </div>
          <span>Carregando agenda…</span>
        </div>
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
                  const items = appointmentsFor(day)
                  const isCurrentMonth = day.getMonth() === month.getMonth()
                  const isToday = date === ymd(new Date())
                  const isSelected = date === selectedDate
                  const hasException = data.overrides.some(
                    (item) => item.local_date.slice(0, 10) === date,
                  )
                  return (
                    <button
                      type="button"
                      role="gridcell"
                      className="manager-month-day"
                      data-outside={!isCurrentMonth || undefined}
                      data-today={isToday || undefined}
                      data-selected={isSelected || undefined}
                      aria-selected={isSelected}
                      aria-label={`${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(day)}, ${items.length} ${items.length === 1 ? 'agendamento' : 'agendamentos'}`}
                      key={date}
                      onClick={() => selectMonthDay(day)}
                    >
                      <span className="manager-month-day-number">
                        {day.getDate()}
                        {hasException && <i title="Horário excepcional" />}
                      </span>
                      <strong>{items.length}</strong>
                      <small>{items.length === 1 ? 'agendamento' : 'agendamentos'}</small>
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
                <Button variant="secondary" onPress={() => openBooking(selectedDay)}>
                  <Plus size={17} /> Agendar neste dia
                </Button>
              </Card.Header>
              <Card.Content>
                {selectedAppointments.length ? (
                  <div className="manager-day-appointments manager-selected-appointments">
                    {selectedAppointments.map((appointment) => {
                      const local = clinicParts(appointment.starts_at, data.timezone)
                      return (
                        <article key={appointment.id} className="manager-appointment-card">
                          <time>{local.time}</time>
                          <div>
                            <strong>{appointment.client_name}</strong>
                            <span>{appointment.service_name}</span>
                            {appointment.professional_name && (
                              <small>{appointment.professional_name}</small>
                            )}
                          </div>
                          {appointment.override_reasons.length > 0 && (
                            <span className="manager-master-key" title="Agendamento com aviso">
                              <AlertTriangle size={15} />
                            </span>
                          )}
                        </article>
                      )
                    })}
                  </div>
                ) : (
                  <div className="manager-empty-real manager-selected-empty">
                    <CalendarClock size={25} />
                    <strong>Nenhum agendamento neste dia</strong>
                    <p>O dia está livre na agenda atual.</p>
                  </div>
                )}
              </Card.Content>
            </Card>
          </div>
        </>
      ) : (
        <div className="manager-week-grid">
          {days.map((day) => {
            const items = appointmentsFor(day)
            const date = ymd(day)
            const exception = data.overrides.find((item) => item.local_date.slice(0, 10) === date)
            return (
              <Card className="manager-panel manager-day-card" key={date}>
                <Card.Header className="manager-day-heading">
                  <div>
                    <span>
                      {new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(day)}
                    </span>
                    <strong>{day.getDate()}</strong>
                  </div>
                  {exception && (
                    <Chip size="sm" variant="soft">
                      Exceção
                    </Chip>
                  )}
                </Card.Header>
                <Card.Content>
                  {items.length ? (
                    <div className="manager-day-appointments">
                      {items.map((appointment) => {
                        const local = clinicParts(appointment.starts_at, data.timezone)
                        return (
                          <article key={appointment.id} className="manager-appointment-card">
                            <time>{local.time}</time>
                            <div>
                              <strong>{appointment.client_name}</strong>
                              <span>{appointment.service_name}</span>
                              {appointment.professional_name && (
                                <small>{appointment.professional_name}</small>
                              )}
                            </div>
                            {appointment.override_reasons.length > 0 && (
                              <span
                                className="manager-master-key"
                                title="Agendamento confirmado com aviso"
                              >
                                <AlertTriangle size={15} />
                              </span>
                            )}
                          </article>
                        )
                      })}
                    </div>
                  ) : (
                    <button
                      className="manager-day-empty"
                      type="button"
                      onClick={() => openBooking(day)}
                    >
                      <Plus size={16} /> Agendar
                    </button>
                  )}
                </Card.Content>
              </Card>
            )
          })}
        </div>
      )}

      <Modal.Backdrop isOpen={bookingOpen} onOpenChange={setBookingOpen}>
        <Modal.Container size="lg">
          <Modal.Dialog className="manager-dialog">
            <Modal.CloseTrigger aria-label="Fechar" />
            <Modal.Header>
              <Modal.Heading>Novo agendamento</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <form id="manager-booking-form" className="manager-form-grid" onSubmit={saveBooking}>
                <label className="manager-field manager-field-wide">
                  <span>Cliente *</span>
                  <select
                    required
                    value={booking.clientId}
                    onChange={(event) => setBooking({ ...booking, clientId: event.target.value })}
                  >
                    <option value="">Selecione</option>
                    {data?.clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.display_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="manager-field">
                  <span>Serviço *</span>
                  <select
                    required
                    value={booking.serviceId}
                    onChange={(event) => setBooking({ ...booking, serviceId: event.target.value })}
                  >
                    <option value="">Selecione</option>
                    {data?.services.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name} · {service.duration_minutes} min
                      </option>
                    ))}
                  </select>
                </label>
                <label className="manager-field">
                  <span>Profissional</span>
                  <select
                    value={booking.professionalId}
                    onChange={(event) =>
                      setBooking({ ...booking, professionalId: event.target.value })
                    }
                  >
                    <option value="">Sem profissional definido</option>
                    {data?.professionals.map((professional) => (
                      <option key={professional.id} value={professional.id}>
                        {professional.display_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="manager-field manager-field-wide">
                  <span>Data e hora ({data?.timezone ?? 'fuso da clínica'}) *</span>
                  <input
                    type="datetime-local"
                    required
                    value={booking.localStartsAt}
                    onChange={(event) =>
                      setBooking({ ...booking, localStartsAt: event.target.value })
                    }
                  />
                </label>
                <label className="manager-field manager-field-wide">
                  <span>Observações internas</span>
                  <textarea
                    rows={3}
                    maxLength={4000}
                    value={booking.notes}
                    onChange={(event) => setBooking({ ...booking, notes: event.target.value })}
                  />
                </label>
              </form>
              {warnings.length > 0 && (
                <div className="manager-warning-box" role="alert">
                  <div>
                    <AlertTriangle size={20} />
                    <strong>Você está usando a chave mestra</strong>
                  </div>
                  {warnings.map((warning) => (
                    <p key={warning.code}>
                      <strong>{warning.title}.</strong> {warning.detail}
                    </p>
                  ))}
                  <small>
                    Clientes continuam sujeitos às travas; esta exceção fica registrada no
                    agendamento.
                  </small>
                </div>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onPress={() => setBookingOpen(false)}>
                Cancelar
              </Button>
              {warnings.length ? (
                <Button isDisabled={saving} onPress={() => void saveBooking(undefined, true)}>
                  {saving ? 'Confirmando…' : 'Entendi, agendar mesmo assim'}
                </Button>
              ) : (
                <Button type="submit" form="manager-booking-form" isDisabled={saving}>
                  {saving ? 'Verificando…' : 'Agendar'}
                </Button>
              )}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      <Modal.Backdrop isOpen={scheduleOpen} onOpenChange={setScheduleOpen}>
        <Modal.Container size="lg">
          <Modal.Dialog className="manager-dialog manager-schedule-dialog">
            <Modal.CloseTrigger aria-label="Fechar" />
            <Modal.Header>
              <Modal.Heading>Horários da clínica</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="manager-schedule-tabs">
                <Button
                  variant={scheduleMode === 'weekly' ? 'primary' : 'secondary'}
                  onPress={() => setScheduleMode('weekly')}
                >
                  <CalendarClock size={17} /> Semana padrão
                </Button>
                <Button
                  variant={scheduleMode === 'override' ? 'primary' : 'secondary'}
                  onPress={() => setScheduleMode('override')}
                >
                  <Clock3 size={17} /> Exceção por data
                </Button>
              </div>
              {scheduleMode === 'weekly' ? (
                <div className="manager-schedule-days">
                  {weekly.map((day) => (
                    <div className="manager-schedule-day" key={day.weekday}>
                      <label className="manager-day-toggle">
                        <input
                          type="checkbox"
                          checked={day.isAvailable}
                          onChange={(event) =>
                            changeDay(day.weekday, {
                              isAvailable: event.target.checked,
                              periods:
                                event.target.checked && !day.periods.length
                                  ? [{ start: '09:00', end: '18:00' }]
                                  : day.periods,
                            })
                          }
                        />
                        <strong>{weekdayNames[day.weekday]}</strong>
                      </label>
                      {day.isAvailable ? (
                        <div className="manager-periods">
                          {day.periods.map((period, index) => (
                            <div key={`${day.weekday}-${index}`}>
                              <input
                                aria-label={`Início de ${weekdayNames[day.weekday]}`}
                                type="time"
                                value={period.start}
                                onChange={(event) =>
                                  changePeriod(day.weekday, index, { start: event.target.value })
                                }
                              />
                              <span>até</span>
                              <input
                                aria-label={`Fim de ${weekdayNames[day.weekday]}`}
                                type="time"
                                value={period.end}
                                onChange={(event) =>
                                  changePeriod(day.weekday, index, { end: event.target.value })
                                }
                              />
                              {day.periods.length > 1 && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onPress={() =>
                                    changeDay(day.weekday, {
                                      periods: day.periods.filter(
                                        (_, itemIndex) => itemIndex !== index,
                                      ),
                                    })
                                  }
                                >
                                  Remover
                                </Button>
                              )}
                            </div>
                          ))}
                          {day.periods.length < 8 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onPress={() =>
                                changeDay(day.weekday, {
                                  periods: [...day.periods, { start: '13:00', end: '18:00' }],
                                })
                              }
                            >
                              + intervalo
                            </Button>
                          )}
                        </div>
                      ) : (
                        <span className="manager-closed-label">Fechado</span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="manager-override-form">
                  <label className="manager-field">
                    <span>Data</span>
                    <input
                      type="date"
                      value={override.date}
                      onChange={(event) => setOverride({ ...override, date: event.target.value })}
                    />
                  </label>
                  <label className="manager-field">
                    <span>Regra</span>
                    <select
                      value={override.kind}
                      onChange={(event) =>
                        setOverride({
                          ...override,
                          kind: event.target.value as typeof override.kind,
                        })
                      }
                    >
                      <option value="custom">Horário especial</option>
                      <option value="closed">Fechado / folga</option>
                      <option value="default">Usar semana padrão</option>
                    </select>
                  </label>
                  {override.kind === 'custom' && (
                    <div className="manager-periods">
                      <div>
                        <input
                          type="time"
                          value={override.start}
                          onChange={(event) =>
                            setOverride({ ...override, start: event.target.value })
                          }
                        />
                        <span>até</span>
                        <input
                          type="time"
                          value={override.end}
                          onChange={(event) =>
                            setOverride({ ...override, end: event.target.value })
                          }
                        />
                      </div>
                    </div>
                  )}
                  {override.kind !== 'default' && (
                    <label className="manager-field manager-field-wide">
                      <span>Motivo interno</span>
                      <input
                        maxLength={240}
                        placeholder="Ex.: horário estendido, feriado ou folga"
                        value={override.reason}
                        onChange={(event) =>
                          setOverride({ ...override, reason: event.target.value })
                        }
                      />
                    </label>
                  )}
                </div>
              )}
              <p className="manager-form-intro">
                A semana padrão controla o que clientes podem escolher. Exceções valem somente para
                a data informada. Agendamentos administrativos continuam podendo ultrapassar essas
                regras após aviso.
              </p>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onPress={() => setScheduleOpen(false)}>
                Cancelar
              </Button>
              <Button isDisabled={saving} onPress={() => void saveAvailability()}>
                {saving ? 'Salvando…' : 'Salvar horários'}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  )
}
