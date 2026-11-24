'use client'

import { DepositPix } from '../../../../components/client-app/deposit-pix'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  CreditCard,
  QrCode,
  Search,
  ShieldCheck,
  Store,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { book, loadAvailability, reschedule, useClient } from '../../../../lib/client-app/store'
import {
  addDays,
  dateLabel,
  dayKey,
  durationLabel,
  effectivePrice,
  formatMoney,
  priceLabel,
} from '../../../../lib/client-app/format'
import type { Availability, Payment, Deposit } from '../../../../lib/client-app/types'
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
  const [params, setParams] = useState<{ service: string | null; move: string | null } | null>(null)
  const [serviceId, setServiceId] = useState<string | null>(null)
  const [professional, setProfessional] = useState<string | null>(null)
  const [chosenDay, setDay] = useState(() => dayKey(new Date()))
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
    setParams({ service: search.get('servico'), move: search.get('remarcar') })
  }, [])

  const slug = space?.summary.slug ?? null
  const moving = space?.appointments.find((item) => item.id === params?.move) ?? null
  const chosenId = serviceId ?? moving?.serviceId ?? params?.service ?? null
  const allServices = useMemo(() => clinic?.services ?? [], [clinic])
  const bookableServices = useMemo(
    () =>
      allServices.filter(
        (item) => !item.rentalDates || item.rentalDates.some((date) => date >= dayKey(new Date())),
      ),
    [allServices],
  )
  const found = useMemo(() => {
    const term = fold(query.trim())
    return term
      ? bookableServices.filter((item) =>
          fold(`${item.name} ${item.category} ${item.description ?? ''}`).includes(term),
        )
      : bookableServices
  }, [bookableServices, query])
  const service =
    (moving ? allServices : bookableServices).find((item) => item.id === chosenId) ?? null
  const dates = (moving?.rentalDates ?? service?.rentalDates)?.filter(
    (value) => value >= dayKey(new Date()),
  )
  const day = dates?.length && !dates.includes(chosenDay) ? dates[0] : chosenDay
  const key = slug && chosenId ? `${slug}|${chosenId}|${day}|${moving?.id ?? ''}` : null

  useEffect(() => {
    if (!slug || !chosenId || !key) return
    let active = true
    void loadAvailability(slug, chosenId, day, moving?.id).then((data) => {
      if (active) setAvailability({ key, data })
    })
    return () => {
      active = false
    }
  }, [slug, chosenId, day, moving?.id, key])

  const days = useMemo(
    () => Array.from({ length: 28 }, (_, index) => addDays(new Date(), index)),
    [],
  )

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
  const freeDays = current ? current.lastDate : null

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
          {service?.name ?? moving?.serviceName} · {dateLabel(done.start)} às{' '}
          {done.start.slice(11, 16)}
          {done.who ? ` com ${done.who}` : ''}.
          {!done.confirmed &&
            !moving &&
            !done.deposit &&
            ' O espaço confirma em seguida e você recebe um aviso.'}
        </p>
        {done.deposit && done.id ? (
          <DepositPix slug={space.summary.slug} appointmentId={done.id} deposit={done.deposit} />
        ) : null}
        <Link className="ca-button" href="/cliente/agenda">
          Ver na agenda
        </Link>
        <Link className="ca-link" href="/cliente">
          Voltar ao início
        </Link>
      </div>
    )

  const priced = Boolean(service && service.priceType !== 'quote' && effectivePrice(service) > 0)
  const price = service && priced ? effectivePrice(service) : 0
  const start = time ? `${day}T${time}` : null
  // Deposit of this service (ADR-042), in the app (Stripe) or by the space's own Pix.
  const depositRule = !moving && priced ? (current?.deposit ?? null) : null
  const depositCents = service && depositRule ? depositOf(service, null, depositRule.percent) : null
  const depositOnline = Boolean(depositRule?.online)
  const depositPix = Boolean(depositRule && !depositRule.online && depositRule.pix)
  // Paying only the deposit online needs at least R$ 0,50; below that it is the full price.
  const payAmount: 'deposit' | 'full' =
    depositOnline && (depositCents ?? 0) >= MIN_ONLINE && amount === 'deposit' ? 'deposit' : 'full'
  // Pix/card only when the space accepts payments in the app; otherwise it is paid there.
  const payInApp = Boolean(priced && current?.inAppPayments && !moving)
  // A service with a deposit in the app cannot be left for the day: Pix or card now.
  const payMethod: Payment['method'] = depositOnline && method === 'local' ? 'pix' : method
  const payNow =
    payMethod === 'local'
      ? depositPix
        ? (depositCents ?? 0)
        : 0
      : payAmount === 'deposit'
        ? (depositCents ?? 0)
        : price
  const showPay = Boolean(start && (payInApp || depositPix))
  const flow: Stage[] = [
    ...(moving ? [] : (['service'] as Stage[])),
    ...(current?.choose && !moving ? (['pro'] as Stage[]) : []),
    'time',
    ...(payInApp || depositPix ? (['pay'] as Stage[]) : []),
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
    setServiceId(id)
    setProfessional(null)
    setTime(null)
    setAmount('deposit')
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
              <label className="ca-search ca-search-soft">
                <Search size={18} aria-hidden />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar serviço"
                  aria-label="Buscar serviço"
                />
                {query && (
                  <button type="button" aria-label="Limpar busca" onClick={() => setQuery('')}>
                    <X size={16} aria-hidden />
                  </button>
                )}
              </label>
              {!clinic ? (
                <div className="ca-pick-list" aria-hidden>
                  {[0, 1, 2].map((item) => (
                    <span key={item} className="ca-skeleton ca-pick-skeleton" />
                  ))}
                </div>
              ) : found.length ? (
                <ul className="ca-pick-list">
                  {found.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        aria-pressed={item.id === chosenId}
                        onClick={() => pickService(item.id)}
                      >
                        <span>
                          <small>{item.category}</small>
                          <strong>{item.name}</strong>
                          <em>{durationLabel(item.durationMinutes)}</em>
                          <ServiceFlags service={item} policy={space.policy} />
                        </span>
                        <b>{priceLabel(item)}</b>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty title="Nenhum serviço encontrado">
                  <p>Tente outro nome.</p>
                </Empty>
              )}
            </>
          )}
        </section>
      )}

      {view !== 'service' && (service || moving) && (
        <div className="ca-picked">
          <span>
            <small>{moving ? 'Remarcando' : 'Serviço'}</small>
            <strong>{service?.name ?? moving?.serviceName}</strong>
            <em>
              {service ? `${priceLabel(service)} · ` : ''}
              {durationLabel(service?.durationMinutes ?? moving?.durationMinutes ?? 0)}
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
            <h2>Quando?</h2>
            <p>Escolha o dia e um horário livre.</p>
          </header>
          {current && !current.choose && team[0] && !moving && (
            <p className="ca-with">
              <Avatar name={team[0].name} photo={team[0].photoUrl} size={30} /> Com{' '}
              <strong>{team[0].name}</strong>
            </p>
          )}
          <div className="ca-days" role="group" aria-label="Dia">
            {(dates ? dates.map((value) => new Date(value + 'T12:00:00')) : days)
              .filter((date) => !freeDays || dayKey(date) <= freeDays)
              .map((date) => {
                const value = dayKey(date)
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={value === day}
                    onClick={() => {
                      setDay(value)
                      setTime(null)
                    }}
                  >
                    <small>
                      {date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                    </small>
                    <b>
                      {dates
                        ? date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
                        : date.getDate()}
                    </b>
                  </button>
                )
              })}
          </div>
          {current === undefined ? (
            <div className="ca-times" aria-hidden>
              {Array.from({ length: 8 }, (_, index) => (
                <span key={index} className="ca-skeleton ca-time-skeleton" />
              ))}
            </div>
          ) : current === null ? (
            <p className="ca-muted">Não foi possível buscar os horários. Tente de novo.</p>
          ) : slots.length ? (
            <div className="ca-times" role="group" aria-label="Horário">
              {slots.map((slot) => (
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
          ) : (
            <p className="ca-muted">Sem horários livres neste dia. Escolha outra data.</p>
          )}
        </section>
      )}

      {view === 'pay' && showPay && (
        <section className="ca-step ca-card-step" aria-label="Pagamento">
          <header className="ca-step-head">
            <h2>Pagamento</h2>
            <p>
              {depositRule
                ? 'Este serviço pede um sinal para reservar o horário.'
                : 'Escolha como prefere pagar.'}
            </p>
          </header>

          {depositOnline && depositCents ? (
            <div className="ca-amounts" role="radiogroup" aria-label="Quanto pagar agora">
              {depositCents >= MIN_ONLINE && (
                <button
                  type="button"
                  role="radio"
                  aria-checked={payAmount === 'deposit'}
                  onClick={() => setAmount('deposit')}
                >
                  <ShieldCheck size={20} aria-hidden />
                  <span>
                    <strong>Pagar só o sinal · {formatMoney(depositCents)}</strong>
                    <small>
                      O restante, {formatMoney(price - depositCents)}, você paga no espaço no dia.
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
                <Wallet size={20} aria-hidden />
                <span>
                  <strong>Pagar tudo agora · {formatMoney(price)}</strong>
                  <small>Nada a pagar no dia.</small>
                </span>
              </button>
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
            <div className="ca-methods" role="radiogroup" aria-label="Forma de pagamento">
              {methods
                .filter(({ value }) => !(depositOnline && value === 'local'))
                .map(({ value, label, hint, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={payMethod === value}
                    onClick={() => setMethod(value)}
                  >
                    <Icon size={20} aria-hidden />
                    <span>
                      <strong>{label}</strong>
                      <small>{hint}</small>
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
              <dt>Serviço</dt>
              <dd>{service?.name ?? moving?.serviceName}</dd>
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
              </dd>
            </div>
            {priced && !moving && (
              <div>
                <dt>Valor</dt>
                <dd>{formatMoney(price)}</dd>
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

      {view !== 'review' && (
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
