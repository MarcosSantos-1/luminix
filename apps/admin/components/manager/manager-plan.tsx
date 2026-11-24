'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  CreditCard,
  Crown,
  Lock,
  MessageCircle,
  QrCode,
  ShieldCheck,
  Store,
} from 'lucide-react'
import { ClinicApiError, type ClinicApi } from './settings/clinic-api'
import { QuickModal } from './quick-modal'
import { supportWhatsAppUrl } from './support'

/** Plan state computed by the API (ADR-039). */
export type PlanAccess = {
  state: 'trial' | 'active' | 'grace' | 'read_only'
  trialEndsAt: string | null
  paidUntil: string | null
  graceEndsAt: string | null
  plan: 'monthly' | 'annual' | null
  paymentMethod: 'card' | 'pix' | null
  cardStatus: 'active' | 'past_due' | 'canceled' | 'incomplete' | null
  cancelAtPeriodEnd: boolean
  complimentary: boolean
  hasCustomer: boolean
}

type PlanId = 'monthly' | 'annual'
type Method = 'card' | 'pix'
type BillingInfo = {
  access: PlanAccess | null
  plans: { id: PlanId; label: string; cents: number; months: number }[]
  available: boolean
}

export const previewPlans = {
  trial: {
    title: 'Período gratuito',
    access: 'Gestão liberada',
    detail: 'A clínica está experimentando os recursos do painel.',
  },
  expired: {
    title: 'Período gratuito encerrado',
    access: 'Teste encerrado',
    detail: 'O período de 12 dias terminou.',
  },
  active: {
    title: 'Assinatura ativa',
    access: 'Gestão liberada',
    detail: 'Os pagamentos da assinatura estão em dia.',
  },
  overdue: {
    title: 'Pagamento pendente',
    access: 'Aguardando regularização',
    detail: 'Existe uma mensalidade em aberto.',
  },
  promise: {
    title: 'Promessa de pagamento',
    access: 'Prazo de pagamento concedido',
    detail: 'A clínica pode trabalhar durante o prazo combinado.',
  },
  blocked: {
    title: 'Assinatura bloqueada',
    access: 'Bloqueio por falta de pagamento',
    detail: 'É preciso regularizar a mensalidade para retomar o acesso.',
  },
} as const
export type PlanPreview = keyof typeof previewPlans

const money = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const day = (iso: string | null | undefined) =>
  iso && Number.isFinite(Date.parse(iso))
    ? new Intl.DateTimeFormat('pt-BR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'America/Sao_Paulo',
      }).format(Date.parse(iso))
    : null

function remainingDays(end: number, now: number) {
  return Math.max(0, Math.min(12, Math.ceil((end - now) / 86_400_000)))
}

/** Short status for the menu card. */
export function planStatus(
  endsAt: string | null | undefined,
  now: number,
  access?: PlanAccess | null,
) {
  if (access?.state === 'active')
    return access.complimentary ? 'Acesso cortesia' : 'Assinatura ativa'
  if (access?.state === 'grace') return 'Pagamento pendente'
  if (access?.state === 'read_only') return 'Só leitura · assine'
  const end = access?.trialEndsAt ?? endsAt
  if (!end || !Number.isFinite(Date.parse(end))) return '12 dias gratuitos'
  const left = remainingDays(Date.parse(end), now)
  if (left <= 0) return 'Período gratuito encerrado'
  return left === 1 ? 'Falta 1 dia' : `Faltam ${left} dias`
}

export function PlanCard({
  status,
  onOpen,
  tone,
}: {
  status: string
  onOpen: () => void
  tone?: 'warn' | 'bad'
}) {
  return (
    <button
      className={`manager-plan card${tone ? ` is-${tone}` : ''}`}
      type="button"
      onClick={onOpen}
    >
      <Crown size={20} aria-hidden />
      <span>
        <strong>Meu plano</strong>
        <small>{status}</small>
      </span>
      <ChevronRight size={16} aria-hidden />
    </button>
  )
}

/** Strip on top of the panel while payment is late (grace) or the space is read-only. */
export function PlanBanner({ access, onOpen }: { access?: PlanAccess | null; onOpen: () => void }) {
  if (!access || (access.state !== 'grace' && access.state !== 'read_only')) return null
  const readOnly = access.state === 'read_only'
  return (
    <div className={`plan-banner${readOnly ? ' is-bad' : ''}`} role="status">
      {readOnly ? <Lock size={18} aria-hidden /> : <AlertTriangle size={18} aria-hidden />}
      <p>
        <strong>
          {readOnly ? 'Seu espaço está só para leitura' : 'O período do seu plano terminou'}
        </strong>
        <span>
          {readOnly
            ? 'Você continua vendo tudo, mas não dá para criar nem editar, e o agendamento online está pausado.'
            : `Assine até ${day(access.graceEndsAt) ?? 'os próximos dias'} para não ficar só leitura.`}
        </span>
      </p>
      <button type="button" className="button button--primary" onClick={onOpen}>
        Ver planos
      </button>
    </div>
  )
}

export function PlanModal({
  isOpen,
  onOpenChange,
  status,
  endsAt,
  preview,
  now,
  clinicName,
  access,
  api,
  canPay = false,
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  status: string
  now: number
  clinicName: string
  preview?: PlanPreview
  endsAt?: string | null
  access?: PlanAccess | null
  /** Real clinic: loads prices and opens the payment. */
  api?: ClinicApi
  /** Owner/administrator (settings:manage): only they subscribe or manage the card. */
  canPay?: boolean
}) {
  const [info, setInfo] = useState<BillingInfo | null>(null)
  const [plan, setPlan] = useState<PlanId>('monthly')
  const [method, setMethod] = useState<Method>('card')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen || !api || preview) return
    let active = true
    void api
      .get<BillingInfo>('billing')
      .then((data) => active && setInfo(data))
      .catch(() => active && setInfo(null))
    return () => {
      active = false
    }
  }, [api, isOpen, preview])

  const current = info?.access ?? access ?? null
  const trialEnd = current?.trialEndsAt ?? endsAt ?? null
  const endTime = trialEnd ? Date.parse(trialEnd) : NaN
  const remaining = Number.isFinite(endTime) ? remainingDays(endTime, now) : 12
  const cardOn =
    current?.paymentMethod === 'card' &&
    (current.cardStatus === 'active' || current.cardStatus === 'past_due')
  const prices = info?.plans ?? [
    { id: 'monthly' as const, label: 'Mensal', cents: 9_990, months: 1 },
    { id: 'annual' as const, label: 'Anual', cents: 90_000, months: 12 },
  ]
  const monthly = prices.find((item) => item.id === 'monthly')?.cents ?? 9_990

  async function pay() {
    if (!api) return
    setBusy(true)
    setError('')
    try {
      const { url } = await api.post<{ url: string }>('billing/checkout', { plan, method })
      window.location.assign(url)
    } catch (caught) {
      const body = caught instanceof ClinicApiError ? caught.body : null
      setError(
        body?.error === 'Subscription already active'
          ? 'Sua assinatura no cartão já está ativa.'
          : 'Não foi possível abrir o pagamento agora. Tente de novo em instantes.',
      )
      setBusy(false)
    }
  }

  async function manage() {
    if (!api) return
    setBusy(true)
    setError('')
    try {
      const { url } = await api.post<{ url: string }>('billing/portal', {})
      window.location.assign(url)
    } catch {
      setError('Não foi possível abrir a área do cartão agora.')
      setBusy(false)
    }
  }

  const headline = preview
    ? previewPlans[preview].title
    : current?.state === 'active'
      ? current.complimentary
        ? 'Acesso cortesia'
        : `Plano ${current.plan === 'annual' ? 'anual' : 'mensal'} ativo`
      : current?.state === 'grace'
        ? 'Pagamento pendente'
        : current?.state === 'read_only'
          ? 'Espaço só para leitura'
          : status

  return (
    <QuickModal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Meu plano"
      size="lg"
      className="plan-dialog"
      badge={
        <>
          <Crown size={13} aria-hidden /> Luminix
        </>
      }
      hero={
        <>
          <div className="qm-hero-art">
            <Image
              src="/brand/onboarding/ministudio-illustration.png"
              width={220}
              height={220}
              sizes="(max-width: 650px) 62px, 200px"
              alt=""
            />
          </div>
          <ul className="qm-hero-facts">
            <li>
              <Store size={16} aria-hidden />
              {clinicName}
            </li>
          </ul>
        </>
      }
      footer={
        <a
          className="button button--secondary plan-support"
          href={supportWhatsAppUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MessageCircle size={17} aria-hidden />
          Falar com o suporte
        </a>
      }
    >
      <section
        className={`plan-period is-${preview ? 'preview' : (current?.state ?? 'trial')}`}
        aria-label="Situação do plano"
      >
        <span>
          {current?.state === 'active' ? (
            <ShieldCheck size={16} aria-hidden />
          ) : current?.state === 'trial' || !current ? (
            <Clock3 size={16} aria-hidden />
          ) : (
            <AlertTriangle size={16} aria-hidden />
          )}
          {preview
            ? 'Simulação local'
            : current?.state === 'active'
              ? 'Assinatura'
              : current?.state === 'trial' || !current
                ? 'Período gratuito'
                : 'Atenção'}
        </span>
        <h3>{headline}</h3>
        {!preview && (current?.state === 'trial' || !current) ? (
          <div className="plan-days" aria-hidden>
            {Array.from({ length: 12 }, (_, index) => (
              <i key={index} data-elapsed={index < 12 - remaining} />
            ))}
          </div>
        ) : null}
        <p>
          <CalendarDays size={15} aria-hidden />
          {preview
            ? previewPlans[preview].detail
            : current?.state === 'active'
              ? current.paymentMethod === 'card' && !current.cancelAtPeriodEnd
                ? `Renova sozinho em ${day(current.paidUntil)}`
                : `Pago até ${day(current.paidUntil)}`
              : current?.state === 'grace'
                ? `Assine até ${day(current.graceEndsAt)} para não ficar só leitura`
                : current?.state === 'read_only'
                  ? 'Seus dados estão guardados. Assine para voltar a editar.'
                  : day(trialEnd)
                    ? `Grátis até ${day(trialEnd)}, sem cartão`
                    : 'Começa ao concluir o cadastro do espaço'}
        </p>
      </section>

      {preview ? null : cardOn ? (
        <section className="plan-pick" aria-label="Assinatura no cartão">
          <p className="plan-note">
            <CreditCard size={16} aria-hidden />
            {current?.cardStatus === 'past_due'
              ? 'A última cobrança no cartão falhou. Atualize o cartão para continuar.'
              : current?.cancelAtPeriodEnd
                ? 'A renovação foi cancelada: o plano vale até o fim do período pago.'
                : 'Cobrança automática no cartão. Troque o cartão, veja faturas ou cancele quando quiser.'}
          </p>
          {canPay ? (
            <button
              type="button"
              className="button button--primary plan-pay"
              disabled={busy}
              onClick={() => void manage()}
            >
              <CreditCard size={17} aria-hidden /> Gerenciar cartão e faturas
            </button>
          ) : null}
        </section>
      ) : current?.complimentary ? null : (
        <section className="plan-pick" aria-label="Escolher plano">
          <div className="plan-options" role="radiogroup" aria-label="Plano">
            {prices.map((item) => {
              const selected = plan === item.id
              const perMonth = Math.round(item.cents / item.months)
              return (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className="plan-option"
                  onClick={() => setPlan(item.id)}
                >
                  <span className="plan-option-head">
                    <strong>{item.label}</strong>
                    {item.months > 1 ? (
                      <em>
                        Economize {Math.round((1 - item.cents / (monthly * item.months)) * 100)}%
                      </em>
                    ) : null}
                  </span>
                  <span className="plan-price">
                    {money(item.cents)}
                    <small>{item.months > 1 ? '/ano' : '/mês'}</small>
                  </span>
                  <small>
                    {item.months > 1
                      ? `Equivale a ${money(perMonth)} por mês`
                      : 'Tudo incluso, cancele quando quiser'}
                  </small>
                  {selected ? <Check className="plan-option-check" size={16} aria-hidden /> : null}
                </button>
              )
            })}
          </div>
          <div className="plan-methods" role="radiogroup" aria-label="Forma de pagamento">
            <button
              type="button"
              role="radio"
              aria-checked={method === 'card'}
              onClick={() => setMethod('card')}
            >
              <CreditCard size={17} aria-hidden />
              <span>
                <strong>Cartão</strong>
                <small>Renova sozinho</small>
              </span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={method === 'pix'}
              onClick={() => setMethod('pix')}
            >
              <QrCode size={17} aria-hidden />
              <span>
                <strong>Pix</strong>
                <small>Paga a cada {plan === 'annual' ? 'ano' : 'mês'}</small>
              </span>
            </button>
          </div>
          {!canPay ? (
            <p className="plan-note">Só quem administra o espaço pode assinar.</p>
          ) : info && !info.available ? (
            <p className="plan-note">
              O pagamento online abre nos próximos dias. Para assinar agora, fale com o suporte.
            </p>
          ) : (
            <button
              type="button"
              className="button button--primary plan-pay"
              disabled={busy || !api}
              onClick={() => void pay()}
            >
              {method === 'card' ? (
                <CreditCard size={17} aria-hidden />
              ) : (
                <QrCode size={17} aria-hidden />
              )}
              {busy
                ? 'Abrindo pagamento…'
                : `${method === 'card' ? 'Assinar com cartão' : 'Pagar com Pix'} · ${money(
                    prices.find((item) => item.id === plan)?.cents ?? 0,
                  )}`}
            </button>
          )}
          {method === 'pix' ? (
            <p className="plan-fine">
              No Pix, o plano vale {plan === 'annual' ? '1 ano' : '1 mês'} a partir do pagamento;
              avisamos antes de vencer.
            </p>
          ) : null}
          {error ? (
            <p className="plan-error" role="alert">
              {error}
            </p>
          ) : null}
        </section>
      )}
    </QuickModal>
  )
}
