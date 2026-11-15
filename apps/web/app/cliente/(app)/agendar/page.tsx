'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, CreditCard, QrCode, Store } from 'lucide-react'
import { book, reschedule, useClient } from '../../../../lib/client-app/store'
import {
  addDays,
  dateLabel,
  dayKey,
  durationLabel,
  effectivePrice,
  formatMoney,
  parseLocal,
  priceLabel,
  slotsFor,
} from '../../../../lib/client-app/format'
import type { Payment } from '../../../../lib/client-app/types'
import { useClinic } from '../../../../components/client-app/use-clinic'
import { Empty, PageHeader, displayStatus } from '../../../../components/client-app/ui'

const methods = [
  { value: 'local', label: 'Pagar no espaço', hint: 'No dia do atendimento', icon: Store },
  { value: 'pix', label: 'Pix', hint: 'Pagamento simulado', icon: QrCode },
  { value: 'card', label: 'Cartão', hint: 'Pagamento simulado', icon: CreditCard },
] as const

export default function BookingPage() {
  const { space } = useClient()
  const { clinic, status } = useClinic(space?.summary.slug ?? null)
  const [params, setParams] = useState<{ service: string | null; move: string | null } | null>(null)
  const [serviceId, setServiceId] = useState<string | null>(null)
  const [day, setDay] = useState(() => dayKey(new Date()))
  const [time, setTime] = useState<string | null>(null)
  const [method, setMethod] = useState<Payment['method']>('local')
  const [done, setDone] = useState<{ start: string; confirmed: boolean } | null>(null)

  useEffect(() => {
    const search = new URLSearchParams(window.location.search)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the URL after hydration
    setParams({ service: search.get('servico'), move: search.get('remarcar') })
  }, [])

  const moving = space?.appointments.find((item) => item.id === params?.move) ?? null
  const chosenId = serviceId ?? moving?.serviceId ?? params?.service ?? null
  const service = clinic?.services.find((item) => item.id === chosenId) ?? null
  const duration = service?.durationMinutes ?? moving?.durationMinutes ?? 30

  const days = useMemo(
    () => Array.from({ length: 21 }, (_, index) => addDays(new Date(), index)),
    [],
  )
  const taken = new Set(
    (space?.appointments ?? [])
      .filter(
        (item) =>
          item.id !== moving?.id && ['confirmed', 'requested'].includes(displayStatus(item)),
      )
      .map((item) => item.start),
  )
  const slots = slotsFor(parseLocal(day), clinic?.hours ?? [], duration, taken)

  if (!space || !params) return null

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
          {done.start.slice(11, 16)}.
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

  function confirm() {
    if (!start || !space) return
    if (moving) {
      reschedule(space.summary.slug, moving.id, start)
      return setDone({ start, confirmed: moving.status === 'confirmed' })
    }
    if (!service) return
    const confirmed = service.bookingMode === 'instant'
    book(
      space.summary.slug,
      {
        serviceId: service.id,
        serviceName: service.name,
        category: service.category,
        start,
        durationMinutes: service.durationMinutes,
        priceCents: priced ? effectivePrice(service) : 0,
        status: confirmed ? 'confirmed' : 'requested',
      },
      method,
    )
    setDone({ start, confirmed })
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
            <strong>{moving.serviceName}</strong>
            <small>{durationLabel(moving.durationMinutes)}</small>
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
                <button type="button" onClick={() => setServiceId(item.id)}>
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

      {(service || moving) && (
        <section className="ca-step">
          <h2>
            <span>2</span> Dia e horário
          </h2>
          <div className="ca-days" role="group" aria-label="Dia">
            {days.map((date) => {
              const key = dayKey(date)
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={key === day}
                  onClick={() => {
                    setDay(key)
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
          {slots.length ? (
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
            <span>3</span> Pagamento
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
          <p className="ca-note">Nenhuma cobrança real é feita nesta versão de avaliação.</p>
        </section>
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
          <button type="button" className="ca-button" onClick={confirm}>
            {moving ? 'Remarcar' : 'Confirmar'} <ArrowRight size={18} aria-hidden />
          </button>
        </footer>
      )}
    </div>
  )
}
