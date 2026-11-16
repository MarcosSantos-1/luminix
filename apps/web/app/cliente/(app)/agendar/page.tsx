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
  const step = { pro: 2, day: current?.choose && !moving ? 3 : 2 }

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
      <PageHeader title={moving ? 'Remarcar horário' : 'Agendar'} kicker={space.summary.name} />

      <section className="ca-step">
        <h2>
          <span>1</span> Serviço
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
        <section className="ca-step">
          <h2>
            <span>{step.pro}</span> Profissional
          </h2>
          <div className="ca-team" role="radiogroup" aria-label="Profissional">
            <button
              type="button"
              role="radio"
              aria-checked={professional === ANY}
              onClick={() => {
                setProfessional(ANY)
                setTime(null)
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
        <section className="ca-step">
          <h2>
            <span>{step.day}</span> Dia e horário
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

      {start && priced && !moving && (
        <section className="ca-step">
          <h2>
            <span>{step.day + 1}</span> Pagamento
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

      <p className="ca-error" role="alert">
        {error}
      </p>

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
