'use client'

import { DepositPix } from '../../../../components/client-app/deposit-pix'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  Gift,
  Layers,
  Moon,
  QrCode,
  Search,
  ShieldCheck,
  Tag,
  Store,
  Sun,
  Sunrise,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import {
  book,
  loadAvailability,
  loadOpenDays,
  loadPackages,
  reschedule,
  useClient,
} from '../../../../lib/client-app/store'
import {
  addDays,
  dateLabel,
  dayKey,
  durationLabel,
  effectivePrice,
  formatMoney,
  priceLabel,
} from '../../../../lib/client-app/format'
import type {
  Availability,
  OpenDays,
  Payment,
  Deposit,
  SpacePackage,
  SpacePackages,
} from '../../../../lib/client-app/types'
import { useClinic } from '../../../../components/client-app/use-clinic'
import {
  Avatar,
  Empty,
  PageHeader,
  ServiceFlags,
  depositOf,
} from '../../../../components/client-app/ui'
import { toast } from '../../../../components/client-app/toast'

const methods = [
  { value: 'local', label: 'Pagar no espaço', hint: 'No dia do atendimento', icon: Store },
  { value: 'pix', label: 'Pix', hint: 'Paga agora, na hora', icon: QrCode },
  { value: 'card', label: 'Cartão', hint: 'Paga agora, à vista', icon: CreditCard },
] as const

/** "" = no preference: the space gives the time to the first professional free. */
const ANY = ''
/** Stripe does not charge less than R$ 0,50. */
const MIN_ONLINE = 50

/** Times grouped by part of the day, like the space's own day: manhã, tarde, noite. */
const periods = [
  { label: 'Manhã', icon: Sunrise, has: (slot: string) => slot < '12:00' },
  { label: 'Tarde', icon: Sun, has: (slot: string) => slot >= '12:00' && slot < '18:00' },
  { label: 'Noite', icon: Moon, has: (slot: string) => slot >= '18:00' },
]
const weekdays = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const monthOf = (value: string) => value.slice(0, 7)

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

type Stage = 'service' | 'pro' | 'time' | 'pay' | 'review'
const stageTitles: Record<Stage, string> = {
  service: 'Serviço',
  pro: 'Profissional',
  time: 'Horário',
  pay: 'Pagamento',
  review: 'Confirmar',
}

export default function BookingPage() {
  const { space } = useClient()
  const { clinic, status } = useClinic(space?.summary.slug ?? null)
  const [params, setParams] = useState<{
    service: string | null
    move: string | null
    pack: string | null
  } | null>(null)
  const [packages, setPackages] = useState<SpacePackages | null>(null)
  // undefined: whatever the link says (?pacote=); null: a plain service was picked.
  const [packChoice, setPackChoice] = useState<string | null | undefined>(undefined)
  const [filter, setFilter] = useState<'all' | 'packages' | 'promo' | string>('all')
  const [serviceId, setServiceId] = useState<string | null>(null)
  const [professional, setProfessional] = useState<string | null>(null)
  // The day the client picked on the calendar; its times show only after the pick.
  const [chosenDay, setDay] = useState<string | null>(null)
  const [month, setMonth] = useState<string | null>(null)
  const [openDays, setOpenDays] = useState<{ key: string; data: OpenDays | null } | null>(null)
  const [time, setTime] = useState<string | null>(null)
  const [method, setMethod] = useState<Payment['method']>('local')
  const [amount, setAmount] = useState<'deposit' | 'full'>('deposit')
  const [query, setQuery] = useState('')
  const [availability, setAvailability] = useState<{
    key: string
    data: Availability | null
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [at, setAt] = useState<Stage>('service')
  const [done, setDone] = useState<{
    start: string
    confirmed: boolean
    who: string | null
    id?: string
    deposit?: Deposit | null
  } | null>(null)

  useEffect(() => {
    const search = new URLSearchParams(window.location.search)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the URL after hydration
    setParams({
      service: search.get('servico'),
      move: search.get('remarcar'),
      pack: search.get('pacote'),
    })
    // Coming from a chosen service or package ("Agendar"): the next step is the time, with
    // the whole package already picked.
    if (search.get('servico') || search.get('pacote')) setAt('time')
  }, [])

  const slug = space?.summary.slug ?? null
  // Packages are booked as a whole: one choice, every session and service in it (ADR-044).
  useEffect(() => {
    if (!slug) return
    let active = true
    void loadPackages(slug).then((data) => {
      if (active) setPackages(data)
    })
    return () => {
      active = false
    }
  }, [slug])
  const packId = packChoice === undefined ? (params?.pack ?? null) : packChoice
  const pack = packId ? (packages?.packages.find((item) => item.id === packId) ?? null) : null
  const moving = space?.appointments.find((item) => item.id === params?.move) ?? null
  // A package opens its visit with its first service.
  const chosenId =
    serviceId ?? moving?.serviceId ?? pack?.items[0]?.serviceId ?? params?.service ?? null
  const allServices = useMemo(() => clinic?.services ?? [], [clinic])
  const bookableServices = useMemo(
    () =>
      allServices.filter(
        (item) => !item.rentalDates || item.rentalDates.some((date) => date >= dayKey(new Date())),
      ),
    [allServices],
  )
  const term = fold(query.trim())
  const found = useMemo(
    () =>
      filter === 'packages'
        ? []
        : bookableServices.filter(
            (item) =>
              (filter === 'all' ||
                (filter === 'promo' ? Boolean(item.promoPercent) : item.category === filter)) &&
              (!term ||
                fold(`${item.name} ${item.category} ${item.description ?? ''}`).includes(term)),
          ),
    [bookableServices, term, filter],
  )
  const foundPackages = useMemo(
    () =>
      filter === 'all' || filter === 'packages'
        ? (packages?.packages ?? []).filter(
            (item) =>
              // Every service of the package must still be bookable.
              item.items.every((part) => bookableServices.some((s) => s.id === part.serviceId)) &&
              (!term ||
                fold(`${item.name} ${item.items.map((part) => part.name).join(' ')}`).includes(
                  term,
                )),
          )
        : [],
    [packages, filter, term, bookableServices],
  )
  const categories = useMemo(
    () => [...new Set(bookableServices.map((item) => item.category))],
    [bookableServices],
  )
  const service =
    (moving ? allServices : bookableServices).find((item) => item.id === chosenId) ?? null
  const dates = (moving?.rentalDates ?? service?.rentalDates)?.filter(
    (value) => value >= dayKey(new Date()),
  )
  // Days the calendar offers: the service's own dates (rental agenda) or the days the space
  // opens inside its booking window.
  const openKey = slug && chosenId ? `${slug}|${chosenId}` : null
  const openData = openDays && openDays.key === openKey ? openDays.data : undefined
  // [] while they load; if they cannot be loaded, the next 60 days (each day says if it is full).
  const offered: string[] =
    dates ??
    (openData === undefined
      ? []
      : (openData?.days ??
        Array.from({ length: 60 }, (_, index) => dayKey(addDays(new Date(), index)))))
  const picked = chosenDay && offered.includes(chosenDay) ? chosenDay : null
  // Before a pick, the first open day still tells who works and how it is paid.
  const day = picked ?? offered[0] ?? dayKey(new Date())
  const visitPack = moving ? null : (pack?.id ?? null)
  const key =
    slug && chosenId ? `${slug}|${chosenId}|${day}|${moving?.id ?? ''}|${visitPack ?? ''}` : null

  useEffect(() => {
    if (!slug || !chosenId || !openKey) return
    let active = true
    void loadOpenDays(slug, chosenId).then((data) => {
      if (active) setOpenDays({ key: openKey, data })
    })
    return () => {
      active = false
    }
  }, [slug, chosenId, openKey])

  useEffect(() => {
    if (!slug || !chosenId || !key) return
    let active = true
    void loadAvailability(slug, chosenId, day, moving?.id, visitPack ?? undefined).then((data) => {
      if (active) setAvailability({ key, data })
    })
    return () => {
      active = false
    }
  }, [slug, chosenId, day, moving?.id, key, visitPack])

  if (!space || !params) return null

  const current = availability && availability.key === key ? availability.data : undefined
  const team = current?.professionals ?? []
  // Rescheduling keeps the same professional; a single professional is chosen for the client.
  const agenda = moving
    ? (moving.professionalId ?? ANY)
    : current && !current.choose
      ? (team[0]?.id ?? ANY)
      : professional
  const slots = !current
    ? []
    : agenda === null
      ? []
      : agenda === ANY && team.length
        ? [...new Set(team.flatMap((item) => current.slots[item.id] ?? []))].sort()
        : (current.slots[agenda] ?? [])
  // Where a combo that pauses over the break ends, for this time.
  const endOf = (slot: string) =>
    (agenda === ANY && team.length ? team.map((item) => item.id) : [agenda ?? ''])
      .map((id) => current?.ends?.[id]?.[slot])
      .find(Boolean) ?? null
  // Calendar month: the picked day's, else the first open day's.
  const today = dayKey(new Date())
  const shownMonth = month ?? monthOf(picked ?? offered[0] ?? today)
  const firstMonth = monthOf(offered[0] ?? today)
  const lastMonth = monthOf(offered[offered.length - 1] ?? today)
  const monthStart = new Date(`${shownMonth}-01T12:00:00`)
  const calendar = (() => {
    const lead = monthStart.getDay()
    const length = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate()
    return Array.from({ length: Math.ceil((lead + length) / 7) * 7 }, (_, index) =>
      index < lead || index >= lead + length ? null : addDays(monthStart, index - lead),
    )
  })()
  const moveMonth = (direction: 1 | -1) =>
    setMonth(
      dayKey(new Date(monthStart.getFullYear(), monthStart.getMonth() + direction, 1, 12)).slice(
        0,
        7,
      ),
    )

  if (done)
    return (
      <div className="ca-page ca-done">
        <span className="ca-done-mark">
          <Check size={30} aria-hidden />
        </span>
        <h1>
          {moving
            ? 'Horário remarcado'
            : done.deposit
              ? 'Falta o sinal'
              : done.confirmed
                ? 'Horário confirmado'
                : 'Pedido enviado'}
        </h1>
        <p className="ca-lead">
          {pack && !moving ? pack.name : (service?.name ?? moving?.serviceName)} ·{' '}
          {dateLabel(done.start)} às {done.start.slice(11, 16)}
          {endOf(done.start.slice(11, 16))
            ? ` até ${endOf(done.start.slice(11, 16))}, com pausa no intervalo`
            : ''}
          {done.who ? ` com ${done.who}` : ''}.
          {!done.confirmed &&
            !moving &&
            !done.deposit &&
            ' O espaço confirma em seguida e você recebe um aviso.'}
        </p>
        {done.deposit && done.id ? (
          <DepositPix slug={space.summary.slug} appointmentId={done.id} deposit={done.deposit} />
        ) : null}
        <Link
          className="ca-button"
          href={
            done.id
              ? `/cliente/agenda?horario=${done.id}`
              : moving
                ? `/cliente/agenda?horario=${moving.id}`
                : `/cliente/agenda?dia=${done.start.slice(0, 10)}`
          }
        >
          Ver na agenda
        </Link>
        <Link className="ca-link" href="/cliente">
          Voltar ao início
        </Link>
      </div>
    )

  const priced =
    Boolean(pack) ||
    Boolean(service && service.priceType !== 'quote' && effectivePrice(service) > 0)
  // A package is paid as a whole: its price, not the session's.
  const price = pack ? pack.priceCents : service && priced ? effectivePrice(service) : 0
  const packApp = Boolean(pack && packages?.payment.app)
  const packClinic = Boolean(pack && (packages?.payment.clinic ?? true))
  const start = picked && time ? `${picked}T${time}` : null
  // Deposit of this service (ADR-042), in the app (Stripe) or by the space's own Pix.
  const depositRule = !moving && priced && !pack ? (current?.deposit ?? null) : null
  const depositCents = service && depositRule ? depositOf(service, null, depositRule.percent) : null
  const depositOnline = Boolean(depositRule?.online)
  const depositPix = Boolean(depositRule && !depositRule.online && depositRule.pix)
  // Paying only the deposit online needs at least R$ 0,50; below that it is the full price.
  const payAmount: 'deposit' | 'full' =
    depositOnline && (depositCents ?? 0) >= MIN_ONLINE && amount === 'deposit' ? 'deposit' : 'full'
  // Pix/card only when the space accepts payments in the app; otherwise it is paid there.
  const payInApp = pack ? packApp : Boolean(priced && current?.inAppPayments && !moving)
  // A service with a deposit in the app (or a package only paid in the app) cannot be left for
  // the day: Pix or card now.
  const payMethod: Payment['method'] =
    (depositOnline || (pack && !packClinic)) && method === 'local' ? 'pix' : method
  const payNow =
    payMethod === 'local'
      ? depositPix
        ? (depositCents ?? 0)
        : 0
      : payAmount === 'deposit'
        ? (depositCents ?? 0)
        : price
  const showPay = Boolean(start && (payInApp || depositPix || pack))
  const flow: Stage[] = [
    ...(moving ? [] : (['service'] as Stage[])),
    ...(current?.choose && !moving ? (['pro'] as Stage[]) : []),
    'time',
    ...(payInApp || depositPix || pack ? (['pay'] as Stage[]) : []),
    'review',
  ]
  // A step the client cannot be on yet falls back to the first one still open.
  const view: Stage =
    !moving && !service
      ? 'service'
      : at === 'service' && moving
        ? 'time'
        : (at === 'time' || at === 'pay' || at === 'review') && agenda === null
          ? 'pro'
          : (at === 'pay' || at === 'review') && !start
            ? 'time'
            : flow.includes(at)
              ? at
              : 'time'
  const position = flow.indexOf(view)
  const ready =
    view === 'service'
      ? Boolean(service)
      : view === 'pro'
        ? agenda !== null
        : view === 'time'
          ? Boolean(start)
          : true
  const reachable = (stage: Stage) =>
    stage === 'service'
      ? !moving
      : stage === 'pro'
        ? Boolean(service)
        : stage === 'time'
          ? agenda !== null
          : Boolean(start)

  function pickService(id: string) {
    setPackChoice(null)
    setServiceId(id)
    setProfessional(null)
    setDay(null)
    setMonth(null)
    setTime(null)
    setAmount('deposit')
    setAt('time')
  }

  /** The whole package: its first service opens the visit; the rest are the next sessions. */
  function pickPackage(item: SpacePackage) {
    setPackChoice(item.id)
    setServiceId(item.items[0]?.serviceId ?? null)
    setProfessional(null)
    setDay(null)
    setMonth(null)
    setTime(null)
    setAt('time')
  }

  async function confirm() {
    if (!start || !space) return
    setBusy(true)
    if (moving) {
      const failure = await reschedule(space.summary.slug, moving.id, start)
      setBusy(false)
      if (failure) return toast.error('Não foi possível remarcar', failure)
      toast.success('Horário remarcado')
      return setDone({
        start,
        confirmed: moving.status === 'confirmed',
        who: moving.professionalName,
      })
    }
    if (!service) return setBusy(false)
    const result = await book(
      space.summary.slug,
      { serviceId: service.id, professionalId: agenda || null, start },
      payInApp ? payMethod : 'local',
      payAmount,
      pack?.id ?? null,
    )
    setBusy(false)
    if (result.error) {
      toast.error('Não foi possível agendar', result.error)
      // The slot list is stale: fetch it again.
      setAvailability(null)
      setTime(null)
      setAt('time')
      return
    }
    // Pix/card in the app: straight to the Stripe page; the agenda shows the result.
    if (result.paymentUrl) {
      window.location.assign(result.paymentUrl)
      return
    }
    const who = team.find((item) => item.id === agenda)?.name ?? null
    toast.success(
      result.status === 'confirmed' ? 'Horário confirmado' : 'Pedido enviado',
      `${service.name} · ${dateLabel(start)} às ${time}`,
    )
    setDone({
      start,
      confirmed: result.status === 'confirmed',
      who,
      id: result.id,
      deposit: result.deposit ?? null,
    })
  }

  return (
    <div className="ca-page ca-booking">
      <PageHeader title={moving ? 'Remarcar horário' : 'Agendar'} kicker={space.summary.name} />

      <ol className="ca-stepper" aria-label="Etapas do agendamento">
        {flow.map((stage, index) => {
          const state = index < position ? 'done' : index === position ? 'current' : 'next'
          return (
            <li key={stage} data-state={state}>
              <button
                type="button"
                disabled={state === 'next' || !reachable(stage)}
                aria-current={state === 'current' ? 'step' : undefined}
                onClick={() => setAt(stage)}
              >
                <span>{state === 'done' ? <Check size={14} aria-hidden /> : index + 1}</span>
                <small>{stageTitles[stage]}</small>
              </button>
            </li>
          )
        })}
      </ol>

      {view === 'service' && (
        <section className="ca-step ca-card-step" aria-label="Serviço">
          <header className="ca-step-head">
            <h2>Qual serviço?</h2>
            <p>Escolha o que você quer fazer.</p>
          </header>
          {status === 'error' ? (
            <Empty title="Não foi possível carregar os serviços" />
          ) : clinic && !bookableServices.length ? (
            <Empty title="Nenhum serviço com datas disponíveis para agendar" />
          ) : (
            <>
              <label className="ca-search ca-search-field">
                <Search size={18} aria-hidden />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar serviço ou pacote"
                  aria-label="Buscar serviço ou pacote"
                />
                {query && (
                  <button type="button" aria-label="Limpar busca" onClick={() => setQuery('')}>
                    <X size={16} aria-hidden />
                  </button>
                )}
              </label>
              <div className="ca-chips" role="group" aria-label="Filtrar">
                <button
                  type="button"
                  aria-pressed={filter === 'all'}
                  onClick={() => setFilter('all')}
                >
                  Todos
                </button>
                {(packages?.packages.length ?? 0) > 0 && (
                  <button
                    type="button"
                    className="ca-chip-special"
                    aria-pressed={filter === 'packages'}
                    onClick={() => setFilter(filter === 'packages' ? 'all' : 'packages')}
                  >
                    <Gift size={14} aria-hidden /> Pacotes
                  </button>
                )}
                {bookableServices.some((item) => item.promoPercent) && (
                  <button
                    type="button"
                    className="ca-chip-promo"
                    aria-pressed={filter === 'promo'}
                    onClick={() => setFilter(filter === 'promo' ? 'all' : 'promo')}
                  >
                    <Tag size={14} aria-hidden /> Em promoção
                  </button>
                )}
                {categories.length > 1 &&
                  categories.map((name) => (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={filter === name}
                      onClick={() => setFilter(filter === name ? 'all' : name)}
                    >
                      {name}
                    </button>
                  ))}
              </div>
              {!clinic ? (
                <div className="ca-pick-list" aria-hidden>
                  {[0, 1, 2].map((item) => (
                    <span key={item} className="ca-skeleton ca-pick-skeleton" />
                  ))}
                </div>
              ) : found.length || foundPackages.length ? (
                <ul className="ca-pick-list ca-book-list">
                  {foundPackages.map((item) => (
                    <li key={`pack-${item.id}`}>
                      <button
                        type="button"
                        className="ca-book-pack"
                        aria-pressed={pack?.id === item.id}
                        onClick={() => pickPackage(item)}
                      >
                        <span className="ca-book-icon" aria-hidden>
                          {item.kind === 'combo' ? <Layers size={20} /> : <Gift size={20} />}
                        </span>
                        <span className="ca-book-text">
                          <small>
                            {item.kind === 'combo' ? 'Combo' : 'Pacote'} · {item.sessions}{' '}
                            {item.sessions === 1 ? 'sessão' : 'sessões'}
                          </small>
                          <strong>{item.name}</strong>
                          <em>
                            {item.items
                              .map((part) =>
                                item.kind === 'combo'
                                  ? `${part.sessions}× ${part.name}`
                                  : part.name,
                              )
                              .join(' · ')}
                          </em>
                        </span>
                        <span className="ca-book-price">
                          {item.singleCents ? <s>{formatMoney(item.singleCents)}</s> : null}
                          <b>{formatMoney(item.priceCents)}</b>
                          <small>
                            {formatMoney(Math.round(item.priceCents / item.sessions))}/sessão
                          </small>
                        </span>
                      </button>
                    </li>
                  ))}
                  {found.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        aria-pressed={!pack && item.id === chosenId}
                        onClick={() => pickService(item.id)}
                      >
                        <span className="ca-book-text">
                          <small>{item.category}</small>
                          <strong>{item.name}</strong>
                          <em>
                            <Clock size={13} aria-hidden /> {durationLabel(item.durationMinutes)}
                          </em>
                          <ServiceFlags service={item} policy={space.policy} />
                        </span>
                        <span className="ca-book-price">
                          {item.promoPriceCents != null && item.priceType !== 'quote' ? (
                            <s>{formatMoney(item.priceCents)}</s>
                          ) : null}
                          <b>{priceLabel(item)}</b>
                          {item.promoPercent ? <small>-{item.promoPercent}%</small> : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty title="Nada encontrado">
                  <p>Tente outro nome ou filtro.</p>
                </Empty>
              )}
            </>
          )}
        </section>
      )}

      {view !== 'service' && (service || moving) && (
        <div className="ca-picked">
          <span>
            <small>
              {moving
                ? 'Remarcando'
                : pack
                  ? pack.kind === 'combo'
                    ? 'Combo'
                    : 'Pacote'
                  : 'Serviço'}
            </small>
            <strong>{pack ? pack.name : (service?.name ?? moving?.serviceName)}</strong>
            <em>
              {pack
                ? `${pack.sessions} sessões · ${formatMoney(pack.priceCents)} · 1ª sessão agora · `
                : service
                  ? `${priceLabel(service)} · `
                  : ''}
              {durationLabel(
                (pack ? (pack.durationMinutes ?? current?.durationMinutes) : null) ??
                  service?.durationMinutes ??
                  moving?.durationMinutes ??
                  0,
              )}
              {moving?.professionalName ? ` · com ${moving.professionalName}` : ''}
            </em>
          </span>
          {!moving && (
            <button type="button" className="ca-link" onClick={() => setAt('service')}>
              Trocar
            </button>
          )}
        </div>
      )}

      {view !== 'service' && service?.bookingMode === 'manual_release' && (
        <p className="ca-flag-note">
          <CalendarClock size={16} aria-hidden />
          Serviço com agenda específica: só aparecem os dias em que o espaço abre essa agenda.
        </p>
      )}

      {view === 'pro' && current?.choose && !moving && (
        <section className="ca-step ca-card-step" aria-label="Profissional">
          <header className="ca-step-head">
            <h2>Com quem?</h2>
            <p>Escolha uma profissional ou deixe o espaço decidir.</p>
          </header>
          <div className="ca-team" role="radiogroup" aria-label="Profissional">
            <button
              type="button"
              role="radio"
              aria-checked={professional === ANY}
              onClick={() => {
                setProfessional(ANY)
                setTime(null)
                setAt('time')
              }}
            >
              <span className="ca-team-any">
                <Users size={20} aria-hidden />
              </span>
              <strong>Sem preferência</strong>
              <small>Primeira livre</small>
            </button>
            {team.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={professional === item.id}
                onClick={() => {
                  setProfessional(item.id)
                  setTime(null)
                  setAt('time')
                }}
              >
                <Avatar name={item.name} photo={item.photoUrl} size={58} />
                <strong>{item.name}</strong>
                <small>{item.role ?? `${current.slots[item.id]?.length ?? 0} horários`}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      {view === 'time' && agenda !== null && (
        <section className="ca-step ca-card-step" aria-label="Dia e horário">
          <header className="ca-step-head">
            <h2>{picked ? 'Que horas?' : 'Que dia?'}</h2>
            <p>
              {picked ? 'Escolha um horário livre.' : 'Só aparecem os dias em que o espaço atende.'}
            </p>
          </header>
          {current && !current.choose && team[0] && !moving && (
            <p className="ca-with">
              <Avatar name={team[0].name} photo={team[0].photoUrl} size={30} /> Com{' '}
              <strong>{team[0].name}</strong>
            </p>
          )}
          {!picked ? (
            <div className="ca-calendar ca-book-calendar">
              <header>
                <button
                  type="button"
                  className="ca-icon-button"
                  aria-label="Mês anterior"
                  disabled={shownMonth <= firstMonth}
                  onClick={() => moveMonth(-1)}
                >
                  <ChevronLeft size={18} aria-hidden />
                </button>
                <strong>
                  {monthStart.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                </strong>
                <button
                  type="button"
                  className="ca-icon-button"
                  aria-label="Próximo mês"
                  disabled={shownMonth >= lastMonth}
                  onClick={() => moveMonth(1)}
                >
                  <ChevronRight size={18} aria-hidden />
                </button>
              </header>
              <div
                className="ca-cal-grid"
                role="group"
                aria-label="Dia"
                aria-busy={openData === undefined && !dates}
              >
                {weekdays.map((label) => (
                  <span key={label} className="ca-cal-head">
                    {label}
                  </span>
                ))}
                {calendar.map((date, index) => {
                  if (!date) return <span key={`blank-${index}`} aria-hidden />
                  const value = dayKey(date)
                  const free = offered.includes(value)
                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={!free}
                      data-out={!free || undefined}
                      data-today={value === today || undefined}
                      aria-label={`${dateLabel(value)}${free ? '' : ', sem atendimento'}`}
                      onClick={() => {
                        setDay(value)
                        setTime(null)
                      }}
                    >
                      {date.getDate()}
                      {free && <i />}
                    </button>
                  )
                })}
              </div>
              {openData === undefined && !dates ? (
                <p className="ca-cal-note" role="status">
                  Buscando os dias livres…
                </p>
              ) : !offered.length ? (
                <p className="ca-cal-note">O espaço não tem dias livres para agendar agora.</p>
              ) : (
                <p className="ca-cal-note">
                  <i aria-hidden /> Dias com atendimento
                  {openData ? ` · até ${dateLabel(openData.lastDate, 'short')}` : ''}
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="ca-day-picked">
                <CalendarDays size={18} aria-hidden />
                <strong>{dateLabel(picked)}</strong>
                <button
                  type="button"
                  className="ca-link"
                  onClick={() => {
                    setMonth(monthOf(picked))
                    setDay(null)
                    setTime(null)
                  }}
                >
                  Trocar dia
                </button>
              </div>
              {current === undefined ? (
                <div className="ca-slots-loading" role="status">
                  <p>
                    <span className="ca-dots" aria-hidden>
                      <i />
                      <i />
                      <i />
                    </span>
                    Buscando horários livres de {dateLabel(picked, 'short')}…
                  </p>
                  <div className="ca-times" aria-hidden>
                    {Array.from({ length: 8 }, (_, index) => (
                      <span
                        key={index}
                        className="ca-skeleton ca-time-skeleton"
                        style={{ animationDelay: `${index * 70}ms` }}
                      />
                    ))}
                  </div>
                </div>
              ) : current === null ? (
                <p className="ca-muted">Não foi possível buscar os horários. Tente de novo.</p>
              ) : slots.length ? (
                <>
                  {periods
                    .map((period) => ({
                      ...period,
                      items: slots.filter((slot) => period.has(slot)),
                    }))
                    .filter((period) => period.items.length)
                    .map(({ label, icon: Icon, items }) => (
                      <div key={label} className="ca-period">
                        <p className="ca-period-head">
                          <Icon size={16} aria-hidden /> {label}
                          <small>
                            {items.length} {items.length === 1 ? 'horário' : 'horários'}
                          </small>
                        </p>
                        <div className="ca-times" role="group" aria-label={`Horários da ${label}`}>
                          {items.map((slot) => (
                            <button
                              key={slot}
                              type="button"
                              aria-pressed={slot === time}
                              onClick={() => setTime(slot)}
                            >
                              {slot}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  {time && endOf(time) ? (
                    <p className="ca-flag-note">
                      <Clock size={16} aria-hidden />
                      Das {time} às {endOf(time)}, com pausa no intervalo do espaço.
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="ca-muted">Sem horários livres neste dia. Escolha outro dia.</p>
              )}
            </>
          )}
        </section>
      )}

      {view === 'pay' && showPay && (
        <section className="ca-step ca-card-step" aria-label="Pagamento">
          <header className="ca-step-head">
            <h2>Pagamento</h2>
            <p>
              {pack
                ? `Pacote ${pack.name} · ${formatMoney(pack.priceCents)} por ${pack.sessions} sessões.`
                : depositRule
                  ? 'Este serviço pede um sinal para reservar o horário.'
                  : 'Escolha como prefere pagar.'}
            </p>
          </header>

          {depositOnline && depositCents ? (
            <>
              <p className="ca-pay-divider">
                <span>Quanto pagar agora</span>
              </p>
              <div className="ca-amounts" role="radiogroup" aria-label="Quanto pagar agora">
                {depositCents >= MIN_ONLINE && (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={payAmount === 'deposit'}
                    onClick={() => setAmount('deposit')}
                  >
                    <i className="ca-radio" aria-hidden />
                    <ShieldCheck size={20} aria-hidden />
                    <span>
                      <strong>Só o sinal</strong>
                      <b>{formatMoney(depositCents)}</b>
                      <small>
                        Restante de {formatMoney(price - depositCents)} no espaço, no dia.
                      </small>
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  role="radio"
                  aria-checked={payAmount === 'full'}
                  onClick={() => setAmount('full')}
                >
                  <i className="ca-radio" aria-hidden />
                  <Wallet size={20} aria-hidden />
                  <span>
                    <strong>Tudo agora</strong>
                    <b>{formatMoney(price)}</b>
                    <small>Nada a pagar no dia.</small>
                  </span>
                </button>
              </div>
            </>
          ) : null}

          {pack && !payInApp ? (
            <div className="ca-flag-note is-strong">
              <Store size={18} aria-hidden />
              <span>
                O pacote é pago no espaço, onde dá para combinar o parcelamento. Aqui você só
                reserva a primeira sessão.
              </span>
            </div>
          ) : null}

          {depositPix && depositCents ? (
            <div className="ca-flag-note is-strong">
              <QrCode size={18} aria-hidden />
              <span>
                Sinal de <strong>{formatMoney(depositCents)}</strong> por Pix, direto para o espaço.
                Depois de confirmar, você recebe o código Pix copia e cola. O restante,{' '}
                {formatMoney(price - depositCents)}, é pago no dia.
              </span>
            </div>
          ) : null}

          {payInApp && (
            <p className="ca-pay-divider">
              <span>Forma de pagamento</span>
            </p>
          )}
          {payInApp && (
            <div className="ca-methods" role="radiogroup" aria-label="Forma de pagamento">
              {methods
                .filter(
                  ({ value }) => !((depositOnline || (pack && !packClinic)) && value === 'local'),
                )
                .map(({ value, label, hint, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={payMethod === value}
                    onClick={() => setMethod(value)}
                  >
                    <i className="ca-radio" aria-hidden />
                    <Icon size={20} aria-hidden />
                    <span>
                      <strong>{label}</strong>
                      <small>
                        {pack && value === 'local'
                          ? 'Parcele com a equipe'
                          : pack
                            ? 'À vista, agora'
                            : hint}
                      </small>
                    </span>
                  </button>
                ))}
            </div>
          )}
          {payInApp && payMethod !== 'local' && (
            <p className="ca-note">
              Pix e cartão abrem a página segura da Stripe. O horário fica guardado por 30 minutos
              até o pagamento.
            </p>
          )}
        </section>
      )}

      {view === 'review' && start && (
        <section className="ca-step ca-card-step ca-review-step" aria-label="Confirmar">
          <header className="ca-step-head">
            <h2>Confira e confirme</h2>
          </header>
          <dl className="ca-review">
            <div>
              <dt>{pack ? 'Pacote' : 'Serviço'}</dt>
              <dd>{pack ? pack.name : (service?.name ?? moving?.serviceName)}</dd>
            </div>
            {(moving?.professionalName ?? team.find((item) => item.id === agenda)?.name) && (
              <div>
                <dt>Com</dt>
                <dd>{moving?.professionalName ?? team.find((item) => item.id === agenda)?.name}</dd>
              </div>
            )}
            {agenda === ANY && current?.choose && !moving && (
              <div>
                <dt>Com</dt>
                <dd>Primeira profissional livre</dd>
              </div>
            )}
            <div>
              <dt>Quando</dt>
              <dd>
                {dateLabel(start)} às {time}
                {time && endOf(time) ? ` · até ${endOf(time)}, com pausa no intervalo` : ''}
              </dd>
            </div>
            {priced && !moving && (
              <div>
                <dt>Valor</dt>
                <dd>
                  {formatMoney(price)}
                  {pack ? ` · ${pack.sessions} sessões` : ''}
                </dd>
              </div>
            )}
            {priced && !moving && (
              <div>
                <dt>Pagamento</dt>
                <dd>
                  {payInApp && payMethod !== 'local'
                    ? `${methods.find((item) => item.value === payMethod)?.label}${payAmount === 'deposit' ? ' · só o sinal' : ''}`
                    : depositPix
                      ? 'Sinal por Pix'
                      : 'No espaço, no dia'}
                </dd>
              </div>
            )}
            {priced && !moving && payNow > 0 && (
              <div className="ca-review-total">
                <dt>Agora</dt>
                <dd>{formatMoney(payNow)}</dd>
              </div>
            )}
            {priced && !moving && payNow > 0 && price > payNow && (
              <div>
                <dt>No dia</dt>
                <dd>{formatMoney(price - payNow)}</dd>
              </div>
            )}
          </dl>
          {!moving && !pack && payInApp && payMethod !== 'local' && (
            <p className="ca-note">
              Se você cancelar dentro do prazo do serviço ou o espaço cancelar, solicitamos à Stripe
              a devolução integral do valor pago. Se o prazo já passou, fale com o espaço.
            </p>
          )}
          {depositPix && (
            <p className="ca-note">
              Antes de pagar o sinal por Pix, confira o prazo e as condições de devolução com o
              espaço. O espaço trata a devolução diretamente com você.
            </p>
          )}
          <button
            type="button"
            className="ca-button"
            disabled={busy}
            onClick={() => void confirm()}
          >
            {busy
              ? 'Enviando…'
              : moving
                ? 'Remarcar'
                : payInApp && payMethod !== 'local'
                  ? `Ir para o pagamento · ${formatMoney(payNow)}`
                  : 'Confirmar agendamento'}{' '}
            <Check size={18} aria-hidden />
          </button>
        </section>
      )}

      {/* Choosing a service already moves on; the buttons appear once there is a choice. */}
      {view !== 'review' && (view !== 'service' || ready) && (
        <nav className="ca-wizard-nav" aria-label="Etapas">
          {position > 0 && (
            <button
              type="button"
              className="ca-button ghost"
              onClick={() => setAt(flow[position - 1])}
            >
              <ArrowLeft size={18} aria-hidden /> Voltar
            </button>
          )}
          <button
            type="button"
            className="ca-button"
            disabled={!ready}
            onClick={() => setAt(flow[position + 1] ?? 'review')}
          >
            Continuar <ArrowRight size={18} aria-hidden />
          </button>
        </nav>
      )}
      {view === 'review' && position > 0 && (
        <button
          type="button"
          className="ca-button ghost ca-back"
          onClick={() => setAt(flow[position - 1])}
        >
          <ArrowLeft size={18} aria-hidden /> Voltar
        </button>
      )}
    </div>
  )
}
