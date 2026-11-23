'use client'

import { Button } from '@heroui/react'
import { AlertTriangle, Check, LogIn } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { MoneyField } from '@/components/ui/fields'
import { money, moneyInput, parseMoney } from '../business/format'
import { ClinicApiError, type ClinicApi } from '../settings/clinic-api'
import { methods, payment } from './complete-visit'
import { needsAgreedPrice, serviceTitle, type AppointmentView } from './model'

/**
 * Money at the desk outside "Concluir": at check-in (where "a combinar"/"a partir de" get their
 * amount and may be charged on arrival) or "Registrar pagamento" at any time, also before the
 * visit. One request: the agreed amount, the payment and the check-in are saved together.
 */
export function ChargeVisit({
  api,
  item,
  intent,
  back,
  onDone,
}: {
  api: ClinicApi
  item: AppointmentView
  intent: 'checkin' | 'pay'
  back: ReactNode
  onDone: (message: string) => void
}) {
  const due = payment(item)
  const pk = item.package ?? null
  const variable = needsAgreedPrice(item)
  const paidSoFar = item.paidCents ?? 0
  const [agreed, setAgreed] = useState(
    variable && item.priceType === 'from' ? moneyInput(item.priceCents ?? 0) : '',
  )
  const agreedCents = variable ? parseMoney(agreed) : null
  const owed = pk
    ? (pk.dueNowCents ?? 0)
    : variable
      ? Math.max(0, (agreedCents ?? 0) - paidSoFar)
      : due.remaining
  const ceiling = pk ? (pk.remainingCents ?? 0) : owed
  // At check-in the client may prefer to pay at the end: that is fine.
  const [now, setNow] = useState(intent === 'pay')
  const [cash, setCash] = useState(owed ? moneyInput(owed) : '')
  const [method, setMethod] = useState('pix')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const cents = now ? (parseMoney(cash) ?? 0) : 0

  async function save() {
    if (variable && (agreedCents == null || !agreed.trim())) {
      setError(
        intent === 'checkin'
          ? 'Informe o valor combinado, ou faça o check-in sem definir.'
          : 'Informe o valor combinado.',
      )
      return
    }
    if (now && !cents) {
      setError('Informe quanto foi pago.')
      return
    }
    if (now && cents > ceiling) {
      setError(`O valor passa do que falta receber (${money(ceiling)}).`)
      return
    }
    setBusy(true)
    setError('')
    const body = {
      ...(variable && agreedCents != null ? { agreedPriceCents: agreedCents } : {}),
      ...(now && cents
        ? {
            payment: {
              amountCents: cents,
              method,
              description: (pk
                ? `Parcela ${pk.name} (${pk.session}/${pk.total}) · ${item.client}`
                : `${item.service} · ${item.client}`
              ).slice(0, 160),
            },
          }
        : {}),
    }
    try {
      await api.put(`appointments/${item.id}/${intent === 'checkin' ? 'check-in' : 'charge'}`, body)
      const first = item.client.split(' ')[0]
      onDone(
        intent === 'checkin'
          ? `${item.client} chegou${cents ? ` · ${money(cents)} recebido` : ''}.`
          : `Pagamento de ${money(cents)} de ${first} registrado.`,
      )
    } catch (caught) {
      setBusy(false)
      setError(
        caught instanceof ClinicApiError && caught.status === 409
          ? 'O valor não pode ficar abaixo do que já foi pago.'
          : caught instanceof ClinicApiError && caught.status === 400 && pk
            ? 'O pagamento passa do saldo do pacote.'
            : 'Não foi possível salvar. Tente de novo.',
      )
    }
  }

  async function plainCheckIn() {
    setBusy(true)
    setError('')
    try {
      await api.put(`appointments/${item.id}/check-in`, {})
      onDone(`${item.client} chegou.`)
    } catch {
      setBusy(false)
      setError('Não foi possível salvar. Tente de novo.')
    }
  }

  return (
    <section className="apt-step cv" aria-label={intent === 'checkin' ? 'Check-in' : 'Pagamento'}>
      {back}
      <header className="cv-head">
        <h3>{intent === 'checkin' ? '👋 Check-in' : '💰 Registrar pagamento'}</h3>
        <p>{serviceTitle(item)}</p>
      </header>

      {variable ? (
        <div className="cv-agreed">
          <MoneyField
            label={
              item.priceType === 'from'
                ? `💬 Valor final (a partir de ${money(item.priceCents ?? 0)})`
                : '💬 Valor combinado'
            }
            autoFocus
            description="Quem define é o espaço. Este tipo de serviço é pago só aqui, nunca pelo app."
            value={agreed}
            onChange={(value) => {
              setAgreed(value)
              setError('')
              const next = Math.max(0, (parseMoney(value) ?? 0) - paidSoFar)
              setCash(next ? moneyInput(next) : '')
            }}
          />
        </div>
      ) : (
        <div className="cv-due">
          <span className="cv-due-label">
            {pk
              ? pk.plan === 'per_visit'
                ? 'Parcela desta sessão'
                : 'Saldo do pacote'
              : 'A receber'}
          </span>
          <strong>{money(owed)}</strong>
        </div>
      )}

      {intent === 'checkin' ? (
        <div className="cv-choice" role="radiogroup" aria-label="Quando cobrar">
          {(
            [
              [true, '💳', 'Cobrar agora', 'Na entrada'],
              [false, '⏳', 'Cobrar no final', 'Ao concluir o atendimento'],
            ] as const
          ).map(([id, emoji, title, hint]) => (
            <button
              key={String(id)}
              type="button"
              role="radio"
              aria-checked={now === id}
              data-tone={id ? 'full' : 'later'}
              onClick={() => {
                setNow(id)
                setError('')
              }}
            >
              <span aria-hidden>{emoji}</span>
              <strong>{title}</strong>
              <small>{hint}</small>
            </button>
          ))}
        </div>
      ) : null}

      {now ? (
        <>
          <MoneyField
            label="Valor recebido"
            description={
              ceiling > owed ? `Pode receber até ${money(ceiling)} (saldo do pacote).` : undefined
            }
            value={cash}
            onChange={(value) => {
              setCash(value)
              setError('')
            }}
          />
          <div className="cv-methods" role="radiogroup" aria-label="Forma de pagamento">
            {methods.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="radio"
                aria-checked={method === entry.id}
                onClick={() => setMethod(entry.id)}
              >
                <span aria-hidden>{entry.emoji}</span> {entry.label}
              </button>
            ))}
          </div>
          {owed - cents > 0 ? (
            <p className="cv-alert" role="note">
              <AlertTriangle size={17} aria-hidden />
              <span>
                <strong>{money(owed - cents)} fica a receber</strong> e aparece no Financeiro até
                ser registrado.
              </span>
            </p>
          ) : null}
        </>
      ) : null}

      {error ? (
        <p className="apt-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="cv-foot">
        {intent === 'checkin' && variable ? (
          <Button variant="ghost" isDisabled={busy} onPress={() => void plainCheckIn()}>
            Definir depois
          </Button>
        ) : (
          <span />
        )}
        <Button className="sh-primary cv-finish" isDisabled={busy} onPress={() => void save()}>
          {intent === 'checkin' ? <LogIn size={19} aria-hidden /> : <Check size={19} aria-hidden />}
          {busy
            ? 'Salvando…'
            : intent === 'checkin'
              ? now && cents
                ? `Check-in e receber ${money(cents)}`
                : 'Confirmar check-in'
              : 'Confirmar pagamento'}
        </Button>
      </div>
    </section>
  )
}
