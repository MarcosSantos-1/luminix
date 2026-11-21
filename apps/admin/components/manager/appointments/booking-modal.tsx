'use client'

import { Button, Spinner } from '@heroui/react'
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Layers,
  Moon,
  Pencil,
  Plus,
  Sparkles,
  TicketPercent,
  Sun,
  Sunrise,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { useId, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  DateInputField,
  SearchInput,
  SelectField,
  TextAreaField,
  TextInputField,
} from '@/components/ui/fields'
import { formatBrPhone, toE164Phone } from '@/lib/phone'
import { holidaysBetween, shiftDate } from '@/lib/holidays'
import { dateBr, initials, money } from '../business/format'
import { ClientAvatar } from '../client-photo'
import { voucherDiscount, type ClientVoucher } from '../clients/voucher-modal'
import { ClinicApiError, type ClinicApi } from '../settings/clinic-api'
import { QuickModal } from '../quick-modal'
import { clock, localDate, type BookingWarning } from './model'

type Period = { start: string; end: string }
export type ClosureRow = {
  id: string
  professional_id: string | null
  starts_on: string
  ends_on: string
  kind: string
  note: string | null
}
export type BookingProfessional = { id: string; display_name: string; photo_url?: string | null }
type BookingClient = {
  id: string
  display_name: string
  contact_phone?: string | null
  photo_url?: string | null
  photo_large_url?: string | null
  account_photo?: boolean
}

export type BookingOptions = {
  clients: BookingClient[]
  services: {
    id: string
    name: string
    duration_minutes: number
    price_cents?: number | null
    price_type?: string
  }[]
  canOpenClients?: boolean
  professionals: BookingProfessional[]
  timezone: string
}
type WindowData = BookingOptions & {
  appointments: {
    client_id: string
    starts_at: string
    ends_at: string
    status: string
    professional_id?: string | null
  }[]
  weeklyAvailability: { weekday: number; is_available: boolean; periods: Period[] }[]
  overrides: {
    local_date: string
    is_available: boolean
    periods: Period[]
    reason: string | null
  }[]
  closures?: ClosureRow[]
  location?: { city: string | null; state: string | null }
}

export const closureKinds: Record<string, string> = {
  vacation: 'Férias',
  collective_vacation: 'Férias coletivas',
  bereavement: 'Luto',
  maintenance: 'Manutenção',
  renovation: 'Reforma',
  sick_leave: 'Licença / atestado',
  training: 'Curso ou treinamento',
  event: 'Evento',
  other: 'Outro motivo',
}

type Step = 'client' | 'service' | 'professional' | 'when' | 'review'
type PackOption = {
  id: string
  serviceId: string
  name: string
  left: number
  status: string
  kind?: 'sessions' | 'combo'
  durationMinutes?: number | null
  items?: { serviceId: string; left: number }[]
}
type Slot = { time: string; state: 'free' | 'outside' | 'busy' | 'past' }

const stepTitle: Record<Step, string> = {
  client: 'Para quem?',
  service: 'Qual serviço?',
  professional: 'Com quem?',
  when: 'Dia e horário',
  review: 'Confirme o agendamento',
}

function minutes(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}
function hhmm(total: number) {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
function weekdayOf(date: string) {
  return new Date(`${date}T12:00:00Z`).getUTCDay()
}
function mondayOf(date: string) {
  const weekday = weekdayOf(date)
  return shiftDate(date, weekday === 0 ? -6 : 1 - weekday)
}

/** The space's hours on a date: a special date wins over the week. */
function dayPeriods(data: WindowData, date: string) {
  const exception = data.overrides.find((item) => item.local_date.slice(0, 10) === date)
  const rule =
    exception ?? data.weeklyAvailability.find((item) => Number(item.weekday) === weekdayOf(date))
  return rule?.is_available ? rule.periods : []
}

function closureOn(data: WindowData, date: string, professionalId: string) {
  return (data.closures ?? []).find(
    (item) =>
      item.starts_on <= date &&
      item.ends_on >= date &&
      (item.professional_id === null || item.professional_id === professionalId),
  )
}

/**
 * Start times in blocks of the service (up to 1h), from 2h before opening to 4h after closing.
 * Times outside the hours, taken or already gone stay visible but marked: the manager may still
 * use them (chave mestra), the API asks for confirmation.
 */
export function buildSlots(
  data: WindowData,
  date: string,
  duration: number,
  professionalId: string,
  now = new Date(),
): Slot[] {
  const periods = dayPeriods(data, date)
  const open = periods.length ? Math.min(...periods.map((item) => minutes(item.start))) : 8 * 60
  const close = periods.length ? Math.max(...periods.map((item) => minutes(item.end))) : 20 * 60
  const step = Math.min(60, Math.max(15, Math.round(Math.min(duration, 60) / 15) * 15))
  const first = Math.max(0, open - (periods.length ? 120 : 0))
  const last = close + (periods.length ? 240 : 0)
  const previousPeriods = dayPeriods(data, shiftDate(date, -1))
  const spillover = Math.max(
    0,
    ...previousPeriods.map((period) => minutes(period.end) + 240 - 1440),
  )
  const today = localDate(now, data.timezone)
  const nowClock = clock(now.toISOString(), data.timezone)
  function relativeMinutes(instant: string) {
    const localDay = localDate(instant, data.timezone)
    const days = (Date.parse(localDay) - Date.parse(date)) / 86400000
    return days * 1440 + minutes(clock(instant, data.timezone))
  }
  const taken = data.appointments
    .filter(
      (item) =>
        (item.status === 'scheduled' || item.status === 'confirmed') &&
        (!professionalId || !item.professional_id || item.professional_id === professionalId),
    )
    .map((item) => ({ start: relativeMinutes(item.starts_at), end: relativeMinutes(item.ends_at) }))
  const starts = new Set<number>()
  for (let start = 0; start + duration <= spillover; start += step) starts.add(start)
  for (let start = first; start < 1440 && start + duration <= last; start += step) starts.add(start)
  const slots: Slot[] = []
  for (const start of [...starts].sort((a, b) => a - b)) {
    const end = start + duration
    const time = hhmm(start)
    const inside = periods.some((item) => minutes(item.start) <= start && minutes(item.end) >= end)
    const busy = taken.some((item) => item.start < end && item.end > start)
    slots.push({
      time,
      state:
        date < today || (date === today && time < nowClock)
          ? 'past'
          : busy
            ? 'busy'
            : inside
              ? 'free'
              : 'outside',
    })
  }
  return slots
}

function durationLabel(value: number) {
  return value < 60
    ? `${value} min`
    : `${Math.floor(value / 60)}h${String(value % 60).padStart(2, '0')}`
}

function Face({ name, photo, size = 44 }: { name: string; photo?: string | null; size?: number }) {
  return (
    <span className="bk-face" style={{ width: size, height: size }} aria-hidden>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- public team photo
        <img src={photo} alt="" />
      ) : (
        initials(name)
      )}
    </span>
  )
}

/**
 * "Novo agendamento" in steps, one decision per screen: on a phone nothing needs typing — the
 * client can be picked from the recent ones, the time is a tap on a block that fits the service.
 */
export function BookingModal({
  api,
  isOpen,
  onOpenChange,
  options,
  initialDate,
  initialClientId,
  onCreated,
}: {
  api: ClinicApi
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  /** Lists already loaded by the agenda; fetched here when missing. */
  options?: BookingOptions | null
  /** YYYY-MM-DD to start on. */
  initialDate?: string
  /** Opens with this client already chosen (from the client's record). */
  initialClientId?: string
  onCreated: (message: string) => void
}) {
  const [step, setStep] = useState<Step>('client')
  const [clientId, setClientId] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [professionalId, setProfessionalId] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [stripStart, setStripStart] = useState('')
  const [query, setQuery] = useState('')
  const [clientForm, setClientForm] = useState(false)
  const [newClients, setNewClients] = useState<BookingClient[]>([])
  const [agendaWindow, setAgendaWindow] = useState<{ key: string; data: WindowData } | null>(null)
  const [warnings, setWarnings] = useState<BookingWarning[]>([])
  // Active packages of the chosen client for the chosen service; one session can pay the visit.
  const [packs, setPacks] = useState<PackOption[]>([])
  const [usePack, setUsePack] = useState(true)
  const [voucherList, setVoucherList] = useState<{
    clientId: string
    items: ClientVoucher[]
  } | null>(null)
  const [voucherId, setVoucherId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const lists = agendaWindow?.data ?? options ?? null
  const clients = useMemo(() => {
    const existing = lists?.clients ?? []
    const ids = new Set(newClients.map((item) => item.id))
    return [...newClients, ...existing.filter((item) => !ids.has(item.id))]
  }, [lists, newClients])
  const today = localDate(new Date(), lists?.timezone)
  const professionals = useMemo(() => lists?.professionals ?? [], [lists])
  // One professional (or none): the agenda is the space's own, no "Com quem?" step.
  const asksProfessional = professionals.length > 1
  const steps: Step[] = asksProfessional
    ? ['client', 'service', 'professional', 'when', 'review']
    : ['client', 'service', 'when', 'review']
  const position = steps.indexOf(step)

  useEffect(() => {
    if (!isOpen) return
    // A day that already went by cannot be booked: it opens on today.
    const todayDate = localDate(new Date(), options?.timezone)
    const start = initialDate && initialDate >= todayDate ? initialDate : todayDate
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a fresh flow each time it opens
    setStep(initialClientId ? 'service' : 'client')
    setClientId(initialClientId ?? '')
    setServiceId('')
    setProfessionalId('')
    setDate(start)
    setTime('')
    setStripStart(mondayOf(start))
    // Fresh occupancy each time: an appointment may have been created since.
    setAgendaWindow(null)
    setPacks([])
    setUsePack(true)
    setVoucherList(null)
    setVoucherId('')
    setQuery('')
    setClientForm(false)
    setNewClients([])
    setWarnings([])
    setError('')
  }, [isOpen, initialDate, initialClientId, options?.timezone])

  // Two weeks of agenda around the strip: hours, special dates, closures and who is booked.
  const windowKey = stripStart
  useEffect(() => {
    if (!isOpen || !windowKey || agendaWindow?.key === windowKey) return
    let active = true
    void api
      .get<WindowData>('agenda', {
        from: new Date(`${shiftDate(windowKey, -1)}T00:00:00.000Z`).toISOString(),
        to: new Date(`${shiftDate(windowKey, 15)}T23:59:59.999Z`).toISOString(),
      })
      .then((data) => active && setAgendaWindow({ key: windowKey, data }))
      .catch(() => active && setError('Não foi possível carregar a agenda.'))
    return () => {
      active = false
    }
  }, [isOpen, windowKey, agendaWindow?.key, api])

  useEffect(() => {
    if (!professionals.length || asksProfessional || professionalId) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the only professional is implied
    setProfessionalId(professionals[0].id)
  }, [professionals, asksProfessional, professionalId])

  useEffect(() => {
    if (!isOpen || !clientId) return
    let active = true
    void api
      .get<{ packages: PackOption[] }>(`clients/${clientId}/packages`)
      .then((body) => active && setPacks(body.packages.filter((item) => item.status === 'active')))
      .catch(() => active && setPacks([]))
    return () => {
      active = false
    }
  }, [isOpen, clientId, api])

  useEffect(() => {
    if (!isOpen || !clientId) return
    let active = true
    void api
      .get<{ vouchers: ClientVoucher[] }>(`clients/${clientId}/vouchers`)
      .then((body) => active && setVoucherList({ clientId, items: body.vouchers }))
      .catch(() => active && setVoucherList({ clientId, items: [] }))
    return () => {
      active = false
    }
  }, [api, clientId, isOpen])

  const client = clients.find((item) => item.id === clientId)
  const service = lists?.services.find((item) => item.id === serviceId)
  const person = professionals.find((item) => item.id === professionalId)
  const data = agendaWindow?.key === windowKey ? agendaWindow.data : null
  const strip = useMemo(
    () =>
      stripStart ? Array.from({ length: 14 }, (_, index) => shiftDate(stripStart, index)) : [],
    [stripStart],
  )
  const holidays = useMemo(
    () =>
      strip.length
        ? holidaysBetween(strip[0], strip[13], {
            state: data?.location?.state,
            city: data?.location?.city,
          })
        : [],
    [strip, data?.location?.state, data?.location?.city],
  )
  // A package of this client that covers the chosen service. "sessions": that service needs a
  // session left. Combo: each visit does every service of the combo (one session of the whole).
  const pack = packs
    .map((item) => {
      const covers = item.items?.length
        ? item.items.some((entry) => entry.serviceId === serviceId)
        : item.serviceId === serviceId
      const line = item.items?.find((entry) => entry.serviceId === serviceId)
      const left = !covers
        ? 0
        : item.kind === 'combo' || !item.items?.length
          ? item.left
          : (line?.left ?? 0)
      return { ...item, left }
    })
    .find((item) => item.left > 0)
  const comboMinutes =
    usePack && pack?.kind === 'combo' && pack.durationMinutes ? pack.durationMinutes : null
  const slots =
    data && service && date && step === 'when'
      ? buildSlots(data, date, comboMinutes ?? Number(service.duration_minutes), professionalId)
      : []
  const validVouchers =
    service?.price_type === 'fixed' &&
    Number(service.price_cents) > 0 &&
    voucherList?.clientId === clientId
      ? voucherList.items.filter((item) => item.status === 'available' && item.expires_on >= date)
      : []
  const chosenVoucher = validVouchers.find((item) => item.id === voucherId)
  const recent = useMemo(() => {
    const seen = new Set<string>()
    const source = [...(agendaWindow?.data.appointments ?? [])].sort((left, right) =>
      right.starts_at.localeCompare(left.starts_at),
    )
    const result: BookingClient[] = []
    for (const item of source) {
      if (seen.has(item.client_id)) continue
      seen.add(item.client_id)
      const found = clients.find((entry) => entry.id === item.client_id)
      if (found) result.push(found)
      if (result.length === 8) break
    }
    return result
  }, [agendaWindow, clients])
  const filtered = useMemo(() => {
    const needle = query.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
    const all = clients
    if (!needle) return all
    return all.filter((item) =>
      item.display_name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(needle),
    )
  }, [clients, query])

  function go(next: Step) {
    setStep(next)
    setWarnings([])
    setError('')
  }
  function advance() {
    const next = steps[position + 1]
    if (next) go(next)
  }
  function back() {
    const previous = steps[position - 1]
    if (previous) go(previous)
  }
  function pickDate(next: string) {
    setDate(next)
    setTime('')
    if (!strip.includes(next)) setStripStart(mondayOf(next))
  }

  async function save(event?: FormEvent, confirm = false) {
    event?.preventDefault()
    if (saving) return
    if (!clientId || !serviceId || !date || !time) {
      setError('Escolha a cliente, o serviço, o dia e o horário.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await api.post('appointments', {
        clientId,
        serviceId,
        professionalId: professionalId || undefined,
        localStartsAt: `${date}T${time}`,
        confirmedWarnings: confirm ? warnings.map((warning) => warning.code) : [],
        ...(pack && usePack
          ? { clientPackageId: pack.id }
          : chosenVoucher
            ? { voucherId: chosenVoucher.id }
            : {}),
      })
      onOpenChange(false)
      onCreated(
        `${client?.display_name ?? 'Agendamento'} marcada para ${date.split('-').reverse().join('/')} às ${time}.`,
      )
    } catch (caught) {
      const body =
        caught instanceof ClinicApiError
          ? (caught.body as { warnings?: BookingWarning[]; error?: string })
          : null
      if (caught instanceof ClinicApiError && caught.status === 409 && body?.warnings)
        setWarnings(body.warnings)
      else if (body?.error === 'Voucher unavailable')
        setError(
          'O voucher não está disponível para este horário. Escolha outro ou retire o desconto.',
        )
      else if (body?.error === 'Outside manager booking window')
        setError(
          'O atendimento precisa caber entre 2 horas antes da abertura e 4 horas depois do fechamento.',
        )
      else setError('Não foi possível criar o agendamento.')
    } finally {
      setSaving(false)
    }
  }

  const dayHoliday = holidays.find((item) => item.date === date)
  const dayClosure = data ? closureOn(data, date, professionalId) : undefined
  const groups = [
    { label: 'Manhã', icon: Sunrise, items: slots.filter((slot) => slot.time < '12:00') },
    {
      label: 'Tarde',
      icon: Sun,
      items: slots.filter((slot) => slot.time >= '12:00' && slot.time < '18:00'),
    },
    { label: 'Noite', icon: Moon, items: slots.filter((slot) => slot.time >= '18:00') },
  ].filter((group) => group.items.length)

  const booking = (
    <QuickModal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="lg"
      className="bk"
      title="Novo agendamento"
      subtitle={
        <span className="bk-progress" aria-label={`Etapa ${position + 1} de ${steps.length}`}>
          {steps.map((item, index) => (
            <i
              key={item}
              data-done={index < position || undefined}
              data-now={index === position || undefined}
            />
          ))}
          <span>{stepTitle[step]}</span>
        </span>
      }
      footer={
        <>
          {position > 0 ? (
            <Button variant="ghost" className="qm-foot-start" onPress={back}>
              <ChevronLeft size={17} aria-hidden /> Voltar
            </Button>
          ) : (
            <Button variant="secondary" onPress={() => onOpenChange(false)}>
              Cancelar
            </Button>
          )}
          {step === 'review' ? (
            warnings.length ? (
              <Button isDisabled={saving} onPress={() => void save(undefined, true)}>
                {saving ? 'Confirmando…' : 'Entendi, agendar mesmo assim'}
              </Button>
            ) : (
              <Button isDisabled={saving} onPress={() => void save()}>
                <Check size={17} aria-hidden /> {saving ? 'Verificando…' : 'Agendar'}
              </Button>
            )
          ) : step === 'when' ? (
            <Button isDisabled={!time} onPress={advance}>
              Continuar <ChevronRight size={17} aria-hidden />
            </Button>
          ) : null}
        </>
      }
    >
      {!lists && !error ? (
        <div className="ws-loading" role="status">
          <Spinner size="sm" aria-hidden /> Carregando…
        </div>
      ) : null}

      {lists && step === 'client' ? (
        <div className="bk-step">
          {lists.canOpenClients ? (
            <Button
              className="bk-new-client"
              variant="ghost"
              size="sm"
              onPress={() => setClientForm(true)}
            >
              <Plus size={16} aria-hidden /> Novo cliente
            </Button>
          ) : null}
          <SearchInput
            ariaLabel="Buscar cliente"
            placeholder="Buscar pelo nome"
            value={query}
            onChange={setQuery}
            onEnter={() => {
              if (filtered.length === 1) {
                setClientId(filtered[0].id)
                setVoucherId('')
                advance()
              }
            }}
          />
          {!query && recent.length ? (
            <section className="bk-recent" aria-label="Clientes recentes">
              <h4>Recentes</h4>
              <div>
                {recent.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={item.id === clientId}
                    onClick={() => {
                      setClientId(item.id)
                      setVoucherId('')
                      advance()
                    }}
                  >
                    <ClientAvatar
                      name={item.display_name}
                      photoUrl={item.photo_url}
                      account={item.account_photo ? { api, clientId: item.id } : null}
                    />
                    <span>{item.display_name.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          {filtered.length ? (
            <ul className="bk-list" aria-label="Clientes">
              {filtered.slice(0, 80).map((item) => (
                <li className="bk-client-row" key={item.id}>
                  <ClientAvatar
                    name={item.display_name}
                    photoUrl={item.photo_url}
                    largeUrl={item.photo_large_url}
                    account={item.account_photo ? { api, clientId: item.id } : null}
                    size="lg"
                    lazy
                    viewable
                  />
                  <button
                    type="button"
                    aria-pressed={item.id === clientId}
                    onClick={() => {
                      setClientId(item.id)
                      setVoucherId('')
                      advance()
                    }}
                  >
                    <span className="bk-client-copy">
                      <strong>{item.display_name}</strong>
                      {item.contact_phone ? (
                        <small>{formatBrPhone(item.contact_phone)}</small>
                      ) : null}
                    </span>
                    <ChevronRight size={17} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="bk-empty">
              <UserRound size={20} aria-hidden />
              {query ? 'Nenhuma cliente com esse nome.' : 'Nenhuma cliente cadastrada ainda.'}
            </p>
          )}
          {filtered.length > 80 ? (
            <p className="bk-hint">Mostrando 80 de {filtered.length}. Digite para refinar.</p>
          ) : null}
        </div>
      ) : null}

      {lists && step === 'service' ? (
        <ul className="bk-list bk-services" aria-label="Serviços">
          {lists.services.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                aria-pressed={item.id === serviceId}
                onClick={() => {
                  setServiceId(item.id)
                  setTime('')
                  advance()
                }}
              >
                <span className="bk-icon">
                  <Sparkles size={18} aria-hidden />
                </span>
                <strong>{item.name}</strong>
                <span className="bk-service-meta">
                  <small>
                    <Clock size={13} aria-hidden /> {durationLabel(item.duration_minutes)}
                  </small>
                  {item.price_type === 'quote' ? (
                    <small>Sob consulta</small>
                  ) : item.price_cents != null ? (
                    <small>
                      {item.price_type === 'from' ? 'A partir de ' : ''}
                      {money(item.price_cents)}
                    </small>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
          {!lists.services.length ? (
            <li className="bk-empty">Cadastre um serviço para poder agendar.</li>
          ) : null}
        </ul>
      ) : null}

      {lists && step === 'professional' ? (
        <div className="bk-people" role="group" aria-label="Profissional">
          <button
            type="button"
            aria-pressed={!professionalId}
            onClick={() => {
              setProfessionalId('')
              setTime('')
              advance()
            }}
          >
            <span className="bk-face is-any" aria-hidden>
              <UsersRound size={22} />
            </span>
            <strong>Sem preferência</strong>
            <small>Quem estiver livre</small>
          </button>
          {professionals.map((item) => {
            const away = data ? closureOn(data, date, item.id) : undefined
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={item.id === professionalId}
                onClick={() => {
                  setProfessionalId(item.id)
                  setTime('')
                  advance()
                }}
              >
                <Face name={item.display_name} photo={item.photo_url} size={64} />
                <strong>{item.display_name}</strong>
                {away?.professional_id ? (
                  <small className="is-away">{closureKinds[away.kind] ?? 'Ausente'}</small>
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}

      {lists && step === 'when' ? (
        <div className="bk-step">
          <div className="bk-strip-head">
            <strong>
              {new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(
                new Date(`${date || stripStart}T12:00:00`),
              )}
            </strong>
            <div>
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                aria-label="Semana anterior"
                isDisabled={stripStart <= mondayOf(today)}
                onPress={() => setStripStart(shiftDate(stripStart, -7))}
              >
                <ChevronLeft size={17} />
              </Button>
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                aria-label="Próxima semana"
                onPress={() => setStripStart(shiftDate(stripStart, 7))}
              >
                <ChevronRight size={17} />
              </Button>
            </div>
          </div>
          <div className="bk-strip lx-scroll" role="listbox" aria-label="Dia">
            {strip
              .filter((day) => day >= today)
              .map((day) => {
                const open = data ? dayPeriods(data, day).length > 0 : true
                const closure = data ? closureOn(data, day, professionalId) : undefined
                const holiday = holidays.find((item) => item.date === day)
                const value = new Date(`${day}T12:00:00`)
                return (
                  <button
                    key={day}
                    type="button"
                    role="option"
                    aria-selected={day === date}
                    data-closed={!open || closure ? true : undefined}
                    data-today={day === today || undefined}
                    aria-current={day === today ? 'date' : undefined}
                    title={holiday?.name ?? (closure ? closureKinds[closure.kind] : undefined)}
                    onClick={() => pickDate(day)}
                  >
                    <small>
                      {new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })
                        .format(value)
                        .replace('.', '')}
                    </small>
                    <strong>{value.getDate()}</strong>
                    {day === today ? <small>Hoje</small> : null}
                    {holiday || closure ? <i aria-hidden /> : null}
                  </button>
                )
              })}
          </div>
          <DateInputField
            className="bk-date-more"
            label="Outra data"
            value={date}
            min={today}
            onChange={(next) => next && pickDate(next)}
          />
          {dayHoliday || dayClosure ? (
            <p className="bk-day-note">
              <CalendarDays size={16} aria-hidden />
              {[
                dayHoliday?.name,
                dayClosure
                  ? `${closureKinds[dayClosure.kind] ?? 'Fechado'}${dayClosure.professional_id ? ` de ${person?.display_name ?? 'quem atende'}` : ' — espaço fechado'}`
                  : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          ) : null}
          {!data ? (
            <div className="ws-loading" role="status">
              <Spinner size="sm" aria-hidden /> Carregando horários…
            </div>
          ) : (
            <>
              {data && !dayPeriods(data, date).length ? (
                <p className="bk-hint">
                  O espaço não abre neste dia. Os horários abaixo ficam fora do expediente.
                </p>
              ) : null}
              {groups.map((group) => (
                <section key={group.label} className="bk-slots" aria-label={group.label}>
                  <h4>
                    <group.icon size={15} aria-hidden /> {group.label}
                  </h4>
                  <div>
                    {group.items.map((slot) => (
                      <button
                        key={slot.time}
                        type="button"
                        data-state={slot.state}
                        aria-pressed={slot.time === time}
                        disabled={slot.state === 'past'}
                        aria-label={`${slot.time}${slot.state === 'outside' ? ', fora do expediente' : slot.state === 'busy' ? ', já ocupado' : slot.state === 'past' ? ', já passou' : ''}`}
                        onClick={() => setTime(slot.time)}
                      >
                        {slot.time}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
              <p className="bk-legend" aria-hidden>
                <span data-state="free">Livre</span>
                <span data-state="outside">Fora do expediente</span>
                <span data-state="busy">Ocupado</span>
              </p>
            </>
          )}
        </div>
      ) : null}

      {lists && step === 'review' ? (
        <div className="bk-review">
          <button type="button" onClick={() => go('client')}>
            <Face name={client?.display_name ?? '?'} size={44} />
            <span>
              <small>Cliente</small>
              <strong>{client?.display_name}</strong>
            </span>
            <Pencil size={15} aria-label="Trocar" />
          </button>
          <button type="button" onClick={() => go('service')}>
            <span className="bk-icon">
              <Sparkles size={18} aria-hidden />
            </span>
            <span>
              <small>Serviço</small>
              <strong>
                {service?.name} · {service?.duration_minutes} min
              </strong>
            </span>
            <Pencil size={15} aria-label="Trocar" />
          </button>
          {asksProfessional ? (
            <button type="button" onClick={() => go('professional')}>
              {person ? (
                <Face name={person.display_name} photo={person.photo_url} size={44} />
              ) : (
                <span className="bk-face is-any" aria-hidden>
                  <UsersRound size={20} />
                </span>
              )}
              <span>
                <small>Profissional</small>
                <strong>{person?.display_name ?? 'Sem preferência'}</strong>
              </span>
              <Pencil size={15} aria-label="Trocar" />
            </button>
          ) : null}
          <button type="button" onClick={() => go('when')}>
            <span className="bk-icon">
              <CalendarDays size={18} aria-hidden />
            </span>
            <span>
              <small>Quando</small>
              <strong>
                {date
                  ? new Intl.DateTimeFormat('pt-BR', {
                      weekday: 'long',
                      day: '2-digit',
                      month: 'long',
                    }).format(new Date(`${date}T12:00:00`))
                  : ''}{' '}
                às {time}
              </strong>
            </span>
            <Pencil size={15} aria-label="Trocar" />
          </button>
          {validVouchers.length && !(pack && usePack) ? (
            <div className="bk-voucher">
              <TicketPercent size={18} aria-hidden />
              <SelectField
                label="Voucher"
                value={chosenVoucher?.id ?? 'none'}
                onChange={(id) => setVoucherId(id === 'none' ? '' : id)}
                options={[
                  { id: 'none', label: 'Sem voucher' },
                  ...validVouchers.map((item) => ({
                    id: item.id,
                    label: `${voucherDiscount(item)} de desconto · até ${dateBr(item.expires_on)}`,
                  })),
                ]}
              />
            </div>
          ) : null}
          {pack ? (
            <button
              type="button"
              className="bk-pack"
              aria-pressed={usePack}
              onClick={() => {
                setUsePack(!usePack)
                setVoucherId('')
              }}
            >
              <span className="bk-icon">
                <Layers size={18} aria-hidden />
              </span>
              <span>
                <small>Pacote da cliente</small>
                <strong>
                  {usePack
                    ? pack.kind === 'combo'
                      ? 'Usar 1 sessão do combo'
                      : 'Usar 1 sessão'
                    : 'Cobrar à parte'}{' '}
                  · {pack.name} ({pack.left === 1 ? 'resta 1' : `restam ${pack.left}`})
                  {usePack && pack.kind === 'combo' && pack.durationMinutes
                    ? ` · todos os tratamentos, ${pack.durationMinutes} min`
                    : ''}
                </strong>
              </span>
              <i aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="apt-error" role="alert">
          {error}
        </p>
      ) : null}
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
            Clientes continuam sujeitos às travas; esta exceção fica registrada no agendamento.
          </small>
        </div>
      )}
    </QuickModal>
  )

  return (
    <>
      {booking}
      {isOpen && clientForm ? (
        <QuickClientModal
          api={api}
          isOpen
          onOpenChange={setClientForm}
          onCreated={(_, created) => {
            setNewClients((current) => [created, ...current])
            setQuery('')
            setClientId(created.id)
            setVoucherId('')
          }}
        />
      ) : null}
    </>
  )
}

type Duplicate = { id: string; display_name: string }

/** Quick client registration (name + WhatsApp). The full record stays on the Clientes page. */
export function QuickClientModal({
  api,
  isOpen,
  onOpenChange,
  onCreated,
  onOpenFull,
}: {
  api: ClinicApi
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (message: string, client: BookingClient) => void
  onOpenFull?: () => void
}) {
  const formId = useId()
  const [form, setForm] = useState({ name: '', phone: '', birthDate: '', notes: '' })
  const [duplicates, setDuplicates] = useState<Duplicate[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a fresh form each time it opens
    setForm({ name: '', phone: '', birthDate: '', notes: '' })
    setDuplicates(null)
    setError('')
  }, [isOpen])

  async function save(event?: FormEvent, confirmDuplicatePhone = false) {
    event?.preventDefault()
    if (saving) return
    const phone = form.phone ? toE164Phone(form.phone) : ''
    if (!form.name.trim()) return setError('Escreva o nome da cliente.')
    if (form.phone && !phone) return setError('Confira o WhatsApp: DDD + número.')
    setSaving(true)
    setError('')
    try {
      const { client } = await api.post<{ client: BookingClient }>('clients', {
        name: form.name.trim(),
        phone,
        birthDate: form.birthDate,
        notes: form.notes,
        confirmDuplicatePhone,
      })
      onOpenChange(false)
      onCreated(`${form.name.trim()} cadastrada.`, client)
    } catch (caught) {
      const body =
        caught instanceof ClinicApiError ? (caught.body as { duplicates?: Duplicate[] }) : null
      if (caught instanceof ClinicApiError && caught.status === 409 && body?.duplicates?.length)
        setDuplicates(body.duplicates)
      else setError('Não foi possível cadastrar. Confira os dados e tente de novo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <QuickModal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Adicionar cliente"
      subtitle="O essencial agora; CPF e o restante você completa na ficha."
      footer={
        <>
          {onOpenFull ? (
            <Button
              variant="ghost"
              className="qm-foot-start"
              onPress={() => {
                onOpenChange(false)
                onOpenFull()
              }}
            >
              Cadastro completo
            </Button>
          ) : null}
          <Button variant="secondary" onPress={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {duplicates ? (
            <Button isDisabled={saving} onPress={() => void save(undefined, true)}>
              {saving ? 'Salvando…' : 'Cadastrar mesmo assim'}
            </Button>
          ) : (
            <Button type="submit" form={formId} isDisabled={saving}>
              {saving ? 'Salvando…' : 'Cadastrar'}
            </Button>
          )}
        </>
      }
    >
      <form id={formId} className="manager-form-grid" onSubmit={save}>
        <TextInputField
          className="manager-field-wide"
          label="Nome"
          isRequired
          autoFocus
          maxLength={160}
          value={form.name}
          onChange={(name) => setForm({ ...form, name })}
        />
        <TextInputField
          label="WhatsApp"
          inputMode="tel"
          placeholder="(11) 98765-4321"
          value={form.phone}
          onChange={(phone) => {
            setForm({ ...form, phone: formatBrPhone(phone) })
            setDuplicates(null)
          }}
        />
        <DateInputField
          label="Nascimento"
          value={form.birthDate}
          onChange={(birthDate) => setForm({ ...form, birthDate })}
        />
        <TextAreaField
          className="manager-field-wide"
          label="Observações (alergias, cuidados)"
          rows={3}
          maxLength={4000}
          value={form.notes}
          onChange={(notes) => setForm({ ...form, notes })}
        />
      </form>
      {duplicates ? (
        <div className="manager-warning-box" role="alert">
          <div>
            <AlertTriangle size={20} />
            <strong>Este WhatsApp já está em outro cadastro</strong>
          </div>
          <p>{duplicates.map((item) => item.display_name).join(', ')}</p>
          <small>Mãe e filha podem dividir o número; confirme se é uma pessoa diferente.</small>
        </div>
      ) : null}
      {error ? (
        <p className="apt-error" role="alert">
          {error}
        </p>
      ) : null}
    </QuickModal>
  )
}
