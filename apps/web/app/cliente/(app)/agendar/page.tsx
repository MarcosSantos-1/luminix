'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, CreditCard, QrCode, Store, Users } from 'lucide-react'
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
import type { Availability, Payment } from '../../../../lib/client-app/types'
import { useClinic } from '../../../../components/client-app/use-clinic'
import { Avatar, Empty, PageHeader } from '../../../../components/client-app/ui'

const methods = [
  { value: 'local', label: 'Pagar no espaço', hint: 'No dia do atendimento', icon: Store },
  { value: 'pix', label: 'Pix', hint: 'Pagamento simulado', icon: QrCode },
  { value: 'card', label: 'Cartão', hint: 'Pagamento simulado', icon: CreditCard },
] as const

/** "" = no preference: the space gives the time to the first professional free. */
const ANY = ''

type Stage = 'service' | 'pro' | 'time' | 'pay' | 'review'
const stageTitles: Record<Stage, string> = {
  service: 'Serviço',
  pro: 'Profissional',
  time: 'Dia e horário',
  pay: 'Pagamento',
  review: 'Revisão',
}

export default function BookingPage() {
  const { space } = useClient()
  const { clinic, status } = useClinic(space?.summary.slug ?? null)
  const [params, setParams] = useState<{ service: string | null; move: string | null } | null>(null)
  const [serviceId, setServiceId] = useState<string | null>(null)
  const [professional, setProfessional] = useState<string | null>(null)
  const [day, setDay] = useState(() => dayKey(new Date()))
  const [time, setTime] = useState<string | null>(null)
  const [method, setMethod] = useState<Payment['method']>('local')
  const [availability, setAvailability] = useState<{
    key: string
    data: Availability | null
  } | null>(null)
  const [busy, setBusy] = useState(false)
  // Phones see one window at a time; wide screens show every section (CSS).
  const [at, setAt] = useState<Stage>('service')
  const [error, setError] = useState('')
  const [done, setDone] = useState<{
    start: string
    confirmed: boolean
    who: string | null
  } | null>(null)

  useEffect(() => {
    const search = new URLSearchParams(window.location.search)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the URL after hydration
    setParams({ service: search.get('servico'), move: search.get('remarcar') })
  }, [])

  const slug = space?.summary.slug ?? null
  const moving = space?.appointments.find((item) => item.id === params?.move) ?? null
  const chosenId = serviceId ?? moving?.serviceId ?? params?.service ?? null
  const service = clinic?.services.find((item) => item.id === chosenId) ?? null
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
          {moving ? 'Horário remarcado' : done.confirmed ? 'Horário confirmado' : 'Pedido enviado'}
        </h1>
        <p className="ca-lead">
          {service?.name ?? moving?.serviceName} · {dateLabel(done.start)} às{' '}
          {done.start.slice(11, 16)}
          {done.who ? ` com ${done.who}` : ''}.
          {!done.confirmed && !moving && ' O espaço confirma em seguida e você recebe um aviso.'}
        </p>
        <Link className="ca-button" href="/cliente/agenda">
          Ver na agenda
        </Link>
        <Link className="ca-link" href="/cliente">
          Voltar ao início
        </Link>
      </div>
    )

  const priced = service && service.priceType !== 'quote' && effectivePrice(service) > 0
  const start = time ? `${day}T${time}` : null
  // Pix/card only when the space accepts payments in the app; otherwise it is paid there.
  const payInApp = Boolean(priced && current?.inAppPayments && !moving)
  const flow: Stage[] = [
    ...(moving ? [] : (['service'] as Stage[])),
    ...(current?.choose && !moving ? (['pro'] as Stage[]) : []),
    'time',
    ...(payInApp ? (['pay'] as Stage[]) : []),
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
  const number = (stage: Stage) => flow.indexOf(stage) + 1
  const ready =
    view === 'service'
      ? Boolean(service)
      : view === 'pro'
        ? agenda !== null
        : view === 'time'
          ? Boolean(start)
          : true
  const hidden = (stage: Stage) => (view !== stage ? true : undefined)
  const shown = (stage: Stage) => (view === stage ? true : undefined)

  async function confirm() {
    if (!start || !space) return
    setBusy(true)
    setError('')
    if (moving) {
      const failure = await reschedule(space.summary.slug, moving.id, start)
      setBusy(false)
      if (failure) return setError(failure)
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
      method,
    )
    setBusy(false)
    if (result.error) {
      setError(result.error)
      // The slot list is stale: fetch it again.
      setAvailability(null)
      setTime(null)
      return
    }
    const who = team.find((item) => item.id === agenda)?.name ?? null
    setDone({ start, confirmed: result.status === 'confirmed', who })
  }

  return (
    <div className="ca-page ca-booking">
      <PageHeader
        title={moving ? 'Remarcar horário' : 'Agendar'}
        kicker={`${space.summary.name} · ${position + 1} de ${flow.length}: ${stageTitles[view]}`}
      />
      <div className="ca-wizard-progress" aria-hidden>
        <span style={{ transform: `scaleX(${(position + 1) / flow.length})` }} />
      </div>

      <section className="ca-step" data-hidden={hidden('service')} data-current={shown('service')}>
        <h2>
          <span>{number('service') || 1}</span> Serviço
        </h2>
        {moving ? (
          <div className="ca-picked">
            <span>
              <strong>{moving.serviceName}</strong>
              <small>
                {durationLabel(moving.durationMinutes)}
                {moving.professionalName ? ` · com ${moving.professionalName}` : ''}
              </small>
            </span>
          </div>
        ) : service ? (
          <div className="ca-picked">
            <span>
              <strong>{service.name}</strong>
              <small>
                {priceLabel(service)} · {durationLabel(service.durationMinutes)}
              </small>
            </span>
            <button
              type="button"
              className="ca-link"
              onClick={() => {
                setServiceId('')
                setProfessional(null)
                setTime(null)
                setAt('service')
              }}
            >
              Trocar
            </button>
          </div>
        ) : status === 'error' ? (
          <Empty title="Não foi possível carregar os serviços" />
        ) : (
          <ul className="ca-pick-list">
            {(clinic?.services ?? []).map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    setServiceId(item.id)
                    setProfessional(null)
                    setTime(null)
                    setAt('time')
                  }}
                >
                  <span>
                    <strong>{item.name}</strong>
                    <small>
                      {item.category} · {durationLabel(item.durationMinutes)}
                    </small>
                  </span>
                  <b>{priceLabel(item)}</b>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(service || moving) && current?.choose && !moving && (
        <section className="ca-step" data-hidden={hidden('pro')} data-current={shown('pro')}>
          <h2>
            <span>{number('pro')}</span> Profissional
          </h2>
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

      {(service || moving) && agenda !== null && (
        <section className="ca-step" data-hidden={hidden('time')} data-current={shown('time')}>
          <h2>
            <span>{number('time')}</span> Dia e horário
          </h2>
          {current && !current.choose && team[0] && !moving && (
            <p className="ca-with">
              <Avatar name={team[0].name} photo={team[0].photoUrl} size={30} /> Com{' '}
              <strong>{team[0].name}</strong>
            </p>
          )}
          <div className="ca-days" role="group" aria-label="Dia">
            {days
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
                    <b>{date.getDate()}</b>
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

      {start && payInApp && (
        <section className="ca-step" data-hidden={hidden('pay')} data-current={shown('pay')}>
          <h2>
            <span>{number('pay')}</span> Pagamento
          </h2>
          <div className="ca-methods" role="radiogroup" aria-label="Forma de pagamento">
            {methods.map(({ value, label, hint, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={method === value}
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
          <p className="ca-note">Pix e cartão ainda são simulados: nenhuma cobrança é feita.</p>
        </section>
      )}

      {start && (
        <section
          className="ca-step ca-review-step"
          data-hidden={hidden('review')}
          data-current={shown('review')}
        >
          <h2>
            <span>{number('review')}</span> Confira e confirme
          </h2>
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
                <dd>{formatMoney(effectivePrice(service))}</dd>
              </div>
            )}
            {priced && !moving && (
              <div>
                <dt>Pagamento</dt>
                <dd>
                  {payInApp
                    ? (methods.find((item) => item.value === method)?.label ?? 'No espaço')
                    : 'No espaço, no dia'}
                </dd>
              </div>
            )}
          </dl>
          <button
            type="button"
            className="ca-button"
            disabled={busy}
            onClick={() => void confirm()}
          >
            {busy ? 'Enviando…' : moving ? 'Remarcar' : 'Confirmar agendamento'}{' '}
            <Check size={18} aria-hidden />
          </button>
        </section>
      )}

      <p className="ca-error" role="alert">
        {error}
      </p>

      {view !== 'review' && (
        <nav className="ca-wizard-nav" aria-label="Etapas">
          {position > 0 && (
            <button
              type="button"
              className="ca-button ghost"
              onClick={() => setAt(flow[position - 1])}
            >
              Voltar
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

      {start && (
        <footer className="ca-confirm">
          <span>
            <small>{dateLabel(start)}</small>
            <strong>
              {time}
              {priced && !moving ? ` · ${formatMoney(effectivePrice(service))}` : ''}
            </strong>
          </span>
          <button
            type="button"
            className="ca-button"
            disabled={busy}
            onClick={() => void confirm()}
          >
            {busy ? 'Enviando…' : moving ? 'Remarcar' : 'Confirmar'}{' '}
            <ArrowRight size={18} aria-hidden />
          </button>
        </footer>
      )}
    </div>
  )
}
